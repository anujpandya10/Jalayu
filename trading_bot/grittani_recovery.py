"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  GRITTANI INSTANT LOSS RECOVERY ENGINE                                      ║
║  Multi-Variable Backtesting Recovery Protocol                               ║
║                                                                             ║
║  Tim Grittani's documented recovery philosophy:                             ║
║                                                                             ║
║  "I don't double down blindly. I wait for the PERFECT setup,                ║
║   then I put on SIZE. The key is patience after a loss —                    ║
║   not desperation. The position size on the recovery trade                  ║
║   must be justified by the R-multiple, not by the loss itself."             ║
║                                                                             ║
║  Mathematical Framework:                                                    ║
║  • R-Multiple system: every trade is measured in R units                    ║
║  • Recovery sizing: base_R × recovery_factor (backed by backtested WR)     ║
║  • Multi-variable backtesting: 7 variables checked before scaling up        ║
║  • Hard ceiling: recovery never pushes size > 3× base regardless            ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import sqlite3
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from legend_engine import LegendVerdict


# ─────────────────────────────────────────────────────────────────────────────
# R-MULTIPLE SYSTEM
#
# Every trade is defined by:
#   R = distance from entry to stop loss (in dollars)
#   Target = entry ± (R × reward_ratio)
#   Actual outcome = net_pnl / R
#
# A +1R trade = made exactly 1 risk unit
# A -1R trade = lost 1 risk unit
# A +3R trade = Grittani's target for recovery trades
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class RUnit:
    """One trade's R-multiple record."""
    trade_id       : str
    symbol         : str
    asset_type     : str
    direction      : str
    entry_price    : float
    stop_price     : float
    target_price   : float
    shares         : float
    R_distance     : float    # |entry - stop| in price
    R_dollar       : float    # R_distance × shares  (risk in dollars)
    actual_pnl     : float    = 0.0
    R_multiple     : float    = 0.0   # actual_pnl / R_dollar
    closed         : bool     = False
    legend_score   : float    = 0.0
    regime         : str      = 'NEUTRAL'
    timestamp      : float    = field(default_factory=time.time)

    # Multi-variable snapshot at entry
    rsi_at_entry   : float    = 50.0
    vwap_dev       : float    = 0.0
    vol_spike      : float    = 1.0
    atr_pct        : float    = 0.0
    float_shares   : float    = 0.0
    news_score     : float    = 0.0
    sykes_score    : float    = 0.0
    grittani_score : float    = 0.0


@dataclass
class RecoveryPlan:
    """Output of the recovery calculator."""
    recommended_size_mult : float    # Multiplier on base position size
    recovery_tier         : str      # 'HOLD_BASE' | 'MILD' | 'MODERATE' | 'AGGRESSIVE'
    target_R_multiple     : float    # What this trade needs to achieve to recover
    dollars_to_recover    : float    # Total loss debt in dollars
    probability_justified : bool     # Is the setup quality high enough to size up?
    variable_score        : float    # 0.0 – 1.0 across 7 Grittani variables
    reasons               : list     = field(default_factory=list)
    hard_blocked          : bool     = False
    block_reason          : str      = ''


# ─────────────────────────────────────────────────────────────────────────────
# GRITTANI'S 7 MULTI-VARIABLE CHECKLIST
# ALL variables are scored 0 or 1. Recovery scaling requires ≥ 5/7 to pass.
#
# Variable 1: Pattern Maturity — is this the 2nd+ leg (not chasing leg 1)?
# Variable 2: Float alignment — does float match the volatility expected?
# Variable 3: Volume velocity — is volume GROWING into the setup?
# Variable 4: RSI regime — RSI in the sweet spot for this direction?
# Variable 5: VWAP relationship — price on correct side of VWAP?
# Variable 6: News catalyst — confirmed OR absent (no half-baked rumors)?
# Variable 7: Reward-to-Risk ≥ 3:1 — target must be 3× the stop distance
# ─────────────────────────────────────────────────────────────────────────────

GRITTANI_MIN_VARIABLES  = 5   # Need 5/7 to scale up
RECOVERY_MAX_MULT       = 3.0 # Absolute cap on size multiplier
RECOVERY_MIN_PROB       = 0.82 # Must have 82%+ win rate in DB for this setup

# Recovery tier multipliers (applied when each variable gate is met)
RECOVERY_TIERS = {
    'HOLD_BASE' : (1.0,  'No recovery conditions met — trade base size'),
    'MILD'      : (1.5,  '5/7 variables passed — 50% size increase'),
    'MODERATE'  : (2.0,  '6/7 variables passed — 100% increase'),
    'AGGRESSIVE': (3.0,  '7/7 variables passed — full 3× size (Grittani max)'),
}


class GrittaniRecoveryEngine:
    """
    Implements Grittani's post-loss position sizing adjustment.

    After a loss, the engine tracks:
      • Dollar loss debt (cumulative unrecovered losses)
      • Recent R-multiples (are we in a drawdown series?)
      • Last 10 trades' win rate for this specific setup type

    On the next trade opportunity, it evaluates all 7 variables and
    recommends a recovery multiplier that is MATHEMATICALLY JUSTIFIED
    by the backtested win rate — not by emotional desperation.
    """

    def __init__(self, db_path: str = './logs/trade_history.db'):
        self.db_path    = db_path
        self._r_log     : list[RUnit] = []     # In-memory R-unit journal
        self._loss_debt : float       = 0.0    # Total dollar debt to recover
        self._streak    : int         = 0      # Consecutive losses
        self._r_history : list[float] = []     # Recent R-multiples (rolling 20)
        self._open_units: dict        = {}     # trade_id → RUnit

        self._init_db()

    def _init_db(self):
        import os
        os.makedirs('./logs', exist_ok=True)
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute('''
            CREATE TABLE IF NOT EXISTS r_journal (
                trade_id       TEXT PRIMARY KEY,
                symbol         TEXT,
                asset_type     TEXT,
                direction      TEXT,
                r_dollar       REAL,
                r_multiple     REAL,
                actual_pnl     REAL,
                legend_score   REAL,
                regime         TEXT,
                rsi_at_entry   REAL,
                vwap_dev       REAL,
                vol_spike      REAL,
                atr_pct        REAL,
                float_shares   REAL,
                news_score     REAL,
                sykes_score    REAL,
                grittani_score REAL,
                closed         INTEGER DEFAULT 0,
                timestamp      REAL
            )
        ''')
        conn.commit()
        conn.close()

    # ─────────────────────────────────────────────────────────────────────
    # R-UNIT LIFECYCLE
    # ─────────────────────────────────────────────────────────────────────
    def open_trade(
        self,
        trade_id    : str,
        symbol      : str,
        asset_type  : str,
        direction   : str,
        entry_price : float,
        stop_price  : float,
        target_price: float,
        shares      : float,
        legend_verdict: LegendVerdict,
        rsi         : float = 50.0,
        vwap_dev    : float = 0.0,
        vol_spike   : float = 1.0,
        atr_pct     : float = 0.0,
        float_shares: float = 0.0,
        news_score  : float = 0.0,
    ) -> RUnit:
        """Register a trade opening. Returns the RUnit for reference."""
        R_dist  = abs(entry_price - stop_price)
        R_dollar= R_dist * shares

        unit = RUnit(
            trade_id     = trade_id,
            symbol       = symbol,
            asset_type   = asset_type,
            direction    = direction,
            entry_price  = entry_price,
            stop_price   = stop_price,
            target_price = target_price,
            shares       = shares,
            R_distance   = R_dist,
            R_dollar     = R_dollar,
            legend_score = legend_verdict.consensus_score,
            regime       = legend_verdict.active_regime,
            rsi_at_entry = rsi,
            vwap_dev     = vwap_dev,
            vol_spike    = vol_spike,
            atr_pct      = atr_pct,
            float_shares = float_shares,
            news_score   = news_score,
            sykes_score  = legend_verdict.sykes_score,
            grittani_score=legend_verdict.grittani_score,
        )
        self._open_units[trade_id] = unit
        self._r_log.append(unit)
        return unit

    def close_trade(self, trade_id: str, actual_pnl: float) -> Optional[RUnit]:
        """Record the outcome of a trade. Updates recovery state."""
        unit = self._open_units.pop(trade_id, None)
        if unit is None:
            return None

        unit.actual_pnl = actual_pnl
        unit.R_multiple = actual_pnl / unit.R_dollar if unit.R_dollar > 0 else 0.0
        unit.closed     = True

        # Update recovery state
        if actual_pnl < 0:
            self._loss_debt += abs(actual_pnl)
            self._streak    += 1
        else:
            recovered = min(self._loss_debt, actual_pnl)
            self._loss_debt = max(0.0, self._loss_debt - actual_pnl)
            if self._loss_debt <= 0:
                self._streak = 0  # Fully recovered

        self._r_history.append(unit.R_multiple)
        if len(self._r_history) > 20:
            self._r_history.pop(0)

        self._persist_unit(unit)
        return unit

    def _persist_unit(self, unit: RUnit):
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.execute('''
            INSERT OR REPLACE INTO r_journal VALUES
            (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ''', (
            unit.trade_id, unit.symbol, unit.asset_type, unit.direction,
            unit.R_dollar, unit.R_multiple, unit.actual_pnl,
            unit.legend_score, unit.regime, unit.rsi_at_entry,
            unit.vwap_dev, unit.vol_spike, unit.atr_pct,
            unit.float_shares, unit.news_score,
            unit.sykes_score, unit.grittani_score,
            int(unit.closed), unit.timestamp,
        ))
        conn.commit()
        conn.close()

    # ─────────────────────────────────────────────────────────────────────
    # GRITTANI'S 7-VARIABLE SCORING ENGINE
    # ─────────────────────────────────────────────────────────────────────
    def _score_7_variables(
        self,
        direction   : str,
        asset_type  : str,
        rsi         : float,
        vwap_dev    : float,
        vol_spike   : float,
        atr_pct     : float,
        float_shares: float,
        news_score  : float,
        entry_price : float,
        stop_price  : float,
        target_price: float,
        legend_score: float,
        ohlcv       : list,
    ) -> tuple[int, list]:
        """
        Returns (passed_variable_count, list_of_variable_results).
        Score of 7/7 = maximum conviction, unlock 3× size.
        """
        variables = []

        # ── VAR 1: Pattern Maturity ────────────────────────────────────────
        # Not chasing the first move. We need evidence of at least 2 legs.
        # Proxy: RSI had a higher reading in the last 10 bars (came off peak)
        if len(ohlcv) >= 15:
            closes = np.array([c[4] for c in ohlcv], dtype=float)
            highs  = np.array([c[2] for c in ohlcv], dtype=float)
            from indicators import calculate_rsi
            rsi_10bars_ago = calculate_rsi(closes[:-5])
            if direction == 'SHORT':
                # For shorts: RSI was higher before (2nd leg up is weaker)
                mature = rsi_10bars_ago > rsi + 5
            else:
                # For longs: RSI was lower before (building momentum)
                mature = rsi_10bars_ago < rsi - 5
            variables.append(('Pattern Maturity', mature))
        else:
            variables.append(('Pattern Maturity', False))

        # ── VAR 2: Float Alignment ────────────────────────────────────────
        # Micro/low float → compatible with high atr and vol spike
        float_ok = (
            (float_shares > 0 and float_shares < 10_000_000 and atr_pct >= 0.02) or
            (float_shares == 0) or   # Unknown float — give benefit of doubt
            (float_shares >= 10_000_000 and atr_pct < 0.025)  # Large float, calm
        )
        variables.append(('Float Alignment', float_ok))

        # ── VAR 3: Volume Velocity ────────────────────────────────────────
        # Volume is growing (not stalling) into the setup
        if len(ohlcv) >= 4:
            vols = [float(c[5]) for c in ohlcv[-4:]]
            vol_growing = vols[-1] > vols[-2] > vols[-3]
            variables.append(('Volume Velocity', vol_growing and vol_spike >= 2.0))
        else:
            variables.append(('Volume Velocity', vol_spike >= 3.0))

        # ── VAR 4: RSI Regime ─────────────────────────────────────────────
        # RSI in the correct zone for this trade direction
        if direction == 'LONG':
            rsi_ok = 30 <= rsi <= 65   # Not overbought, not in freefall
        else:
            rsi_ok = 55 <= rsi <= 85   # Overbought but not capitulating yet
        variables.append(('RSI Regime', rsi_ok))

        # ── VAR 5: VWAP Relationship ──────────────────────────────────────
        if direction == 'LONG':
            vwap_ok = -2.0 <= vwap_dev <= 0.5   # Near or below VWAP for longs
        else:
            vwap_ok = -0.5 <= vwap_dev <= 2.0   # Near or above VWAP for shorts
        variables.append(('VWAP Relationship', vwap_ok))

        # ── VAR 6: News Catalyst Quality ─────────────────────────────────
        # Confirmed catalyst (> 0.3) OR clean chart (< -0.1 = bad news short)
        # Avoid the "maybe" zone (-0.1 to 0.3) = rumor = noise
        catalyst_clean = (news_score > 0.3) or (news_score < -0.3) or (abs(news_score) < 0.05)
        variables.append(('News Catalyst', catalyst_clean))

        # ── VAR 7: Reward-to-Risk ≥ 3:1 ──────────────────────────────────
        # Grittani's iron rule: target must be ≥ 3× stop distance
        if abs(stop_price - entry_price) > 0:
            rr_ratio = abs(target_price - entry_price) / abs(stop_price - entry_price)
        else:
            rr_ratio = 0.0
        rr_ok = rr_ratio >= 3.0
        variables.append(('Reward-to-Risk ≥3:1', rr_ok and rr_ratio >= 3.0))

        passed = sum(1 for _, v in variables if v)
        return passed, variables

    # ─────────────────────────────────────────────────────────────────────
    # BACKTESTED WIN RATE FOR THIS SETUP
    # ─────────────────────────────────────────────────────────────────────
    def _query_setup_winrate(
        self,
        asset_type: str,
        direction : str,
        regime    : str,
    ) -> tuple[float, int]:
        """
        Query the R-journal for how this specific setup type has performed.
        Returns (win_rate, sample_count).
        """
        try:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            cutoff = time.time() - (60 * 86400)  # 60 days
            row = conn.execute('''
                SELECT COUNT(*), SUM(CASE WHEN r_multiple > 0 THEN 1 ELSE 0 END)
                FROM r_journal
                WHERE asset_type = ? AND direction = ? AND regime = ?
                  AND closed = 1 AND timestamp >= ?
            ''', (asset_type, direction, regime, cutoff)).fetchone()
            conn.close()
            n, wins = row[0] or 0, row[1] or 0
            return (wins / n, n) if n >= 5 else (0.0, n)
        except Exception:
            return 0.0, 0

    # ─────────────────────────────────────────────────────────────────────
    # CORE: COMPUTE RECOVERY PLAN
    # ─────────────────────────────────────────────────────────────────────
    def compute_recovery_plan(
        self,
        direction    : str,
        asset_type   : str,
        regime       : str,
        entry_price  : float,
        stop_price   : float,
        target_price : float,
        legend_verdict: LegendVerdict,
        rsi          : float = 50.0,
        vwap_dev     : float = 0.0,
        vol_spike    : float = 1.0,
        atr_pct      : float = 0.0,
        float_shares : float = 0.0,
        news_score   : float = 0.0,
        ohlcv        : list  = None,
    ) -> RecoveryPlan:
        """
        Grittani's multi-variable recovery sizing.
        Returns a RecoveryPlan specifying how much to scale position size.
        """
        reasons = []

        # ── No recovery needed ────────────────────────────────────────────
        if self._loss_debt <= 0:
            return RecoveryPlan(
                recommended_size_mult = 1.0,
                recovery_tier         = 'HOLD_BASE',
                target_R_multiple     = 1.5,
                dollars_to_recover    = 0.0,
                probability_justified = True,
                variable_score        = 1.0,
                reasons               = ['No loss debt — trade base size'],
            )

        # ── Hard block: too many consecutive losses ────────────────────────
        if self._streak >= 5:
            return RecoveryPlan(
                recommended_size_mult = 0.5,   # Actually SIZE DOWN
                recovery_tier         = 'HOLD_BASE',
                target_R_multiple     = 1.0,
                dollars_to_recover    = self._loss_debt,
                probability_justified = False,
                variable_score        = 0.0,
                hard_blocked          = True,
                block_reason          = f'Grittani hard block: {self._streak} consecutive losses. SIZE DOWN to 0.5× until streak breaks.',
                reasons               = ['HARD BLOCK: Severe drawdown streak. Reduce size, not increase.'],
            )

        # ── Run 7-variable check ──────────────────────────────────────────
        passed, var_results = self._score_7_variables(
            direction, asset_type, rsi, vwap_dev, vol_spike, atr_pct,
            float_shares, news_score, entry_price, stop_price, target_price,
            legend_verdict.consensus_score, ohlcv or [],
        )

        variable_score = passed / 7.0
        for name, result in var_results:
            status = '✓' if result else '✗'
            reasons.append(f'{status} {name}')

        reasons.append(f'Total: {passed}/7 Grittani variables passed')

        # ── Backtested win rate check ─────────────────────────────────────
        db_win_rate, db_samples = self._query_setup_winrate(
            asset_type, direction, regime
        )
        if db_samples >= 5:
            reasons.append(
                f'Backtested WR: {db_win_rate*100:.1f}% over {db_samples} similar trades'
            )

        probability_ok = (
            db_samples < 5 or   # Not enough data — allow with caution
            db_win_rate >= RECOVERY_MIN_PROB
        )

        if not probability_ok:
            reasons.append(
                f'Backtested WR {db_win_rate*100:.1f}% < {RECOVERY_MIN_PROB*100:.0f}% — '
                f'refusing to scale into bad setup'
            )
            return RecoveryPlan(
                recommended_size_mult = 1.0,
                recovery_tier         = 'HOLD_BASE',
                target_R_multiple     = 1.5,
                dollars_to_recover    = self._loss_debt,
                probability_justified = False,
                variable_score        = variable_score,
                reasons               = reasons,
            )

        # ── Determine recovery tier ───────────────────────────────────────
        if passed == 7:
            tier     = 'AGGRESSIVE'
            mult     = 3.0
        elif passed >= 6:
            tier     = 'MODERATE'
            mult     = 2.0
        elif passed >= GRITTANI_MIN_VARIABLES:
            tier     = 'MILD'
            mult     = 1.5
        else:
            tier     = 'HOLD_BASE'
            mult     = 1.0
            reasons.append(f'Only {passed}/7 variables — Grittani says: base size only')

        # ── Calculate required R to recover ──────────────────────────────
        # With mult × base_size at this R setup, how many R's needed?
        R_distance  = abs(entry_price - stop_price)
        target_R    = 3.0 if tier == 'AGGRESSIVE' else 2.0

        description = RECOVERY_TIERS[tier][1]
        reasons.append(f'Recovery tier: {tier} — {description}')
        reasons.append(
            f'Debt: ${self._loss_debt:.4f} | '
            f'Consecutive losses: {self._streak} | '
            f'Target R: {target_R:.1f}×'
        )

        return RecoveryPlan(
            recommended_size_mult = mult,
            recovery_tier         = tier,
            target_R_multiple     = target_R,
            dollars_to_recover    = self._loss_debt,
            probability_justified = probability_ok,
            variable_score        = variable_score,
            reasons               = reasons,
        )

    # ─────────────────────────────────────────────────────────────────────
    # ANALYTICS
    # ─────────────────────────────────────────────────────────────────────
    def get_r_stats(self) -> dict:
        """Summary statistics from recent R-multiple history."""
        if not self._r_history:
            return {'avg_R': 0.0, 'win_rate_R': 0.0, 'expectancy': 0.0}

        arr     = np.array(self._r_history)
        wins    = arr[arr > 0]
        losses  = arr[arr < 0]
        win_rate= len(wins) / len(arr)
        avg_win = float(np.mean(wins)) if len(wins) else 0.0
        avg_loss= float(np.mean(np.abs(losses))) if len(losses) else 1.0

        # Kelly-adjusted expectancy
        expectancy = (win_rate * avg_win) - ((1 - win_rate) * avg_loss)

        return {
            'avg_R'           : round(float(np.mean(arr)), 3),
            'win_rate_R'      : round(win_rate * 100, 1),
            'avg_win_R'       : round(avg_win, 3),
            'avg_loss_R'      : round(avg_loss, 3),
            'expectancy_R'    : round(expectancy, 4),
            'loss_debt'       : round(self._loss_debt, 4),
            'consecutive_loss': self._streak,
            'sample_size'     : len(self._r_history),
        }
