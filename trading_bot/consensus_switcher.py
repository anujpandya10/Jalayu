"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  DYNAMIC CONSENSUS SWITCHER                                                 ║
║  Market Regime Detector + Mode Router                                       ║
║                                                                             ║
║  Detects three market states and routes to the correct legend engine:       ║
║                                                                             ║
║  PENNY_LEGEND   → Sykes/Grittani/Kellogg dominant                          ║
║    Trigger: ATR ultra-high + low-float assets surging + volume spike ≥ 5×  ║
║                                                                             ║
║  VALUE_SCALPER  → Buffett dominant                                          ║
║    Trigger: ATR low + high liquidity + no penny catalysts active            ║
║                                                                             ║
║  NEUTRAL        → Balanced weights                                          ║
║    Trigger: Mixed signals or insufficient data                              ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import time
from dataclasses import dataclass, field
from typing import Optional
from collections import deque

import numpy as np

from indicators import calculate_atr, calculate_rsi, calculate_vwap, vwap_deviation_pct


# ─────────────────────────────────────────────────────────────────────────────
# REGIME THRESHOLDS  (tuned to $100 → $300 compounding objective)
# ─────────────────────────────────────────────────────────────────────────────

# PENNY_LEGEND mode activation
PENNY_ATR_PCT_THRESHOLD  = 0.035  # ATR > 3.5% of price = ultra-high vol
PENNY_VOL_SPIKE_MIN      = 5.0    # At least one asset with 5× relative volume
PENNY_SURGE_PCT_MIN      = 15.0   # At least one asset up 15%+ in session
PENNY_MIN_SIGNALS        = 2      # Need ≥ 2 penny signals active simultaneously

# VALUE_SCALPER mode activation
VALUE_ATR_PCT_MAX        = 0.012  # ATR < 1.2% of price = calm market
VALUE_LIQUIDITY_MIN      = 0.8    # Normalised liquidity score ≥ 0.8
VALUE_CLEAN_BARS_MIN     = 5      # 5 consecutive bars without extreme moves

# Regime stability — how many cycles before we switch
REGIME_MIN_HOLD_CYCLES   = 3      # Don't whipsaw between regimes
REGIME_HISTORY_LEN       = 10     # Rolling window for regime vote


@dataclass
class RegimeSignal:
    """One asset's contribution to the regime vote."""
    symbol       : str
    atr_pct      : float  # ATR as % of price
    vol_spike    : float  # Volume spike multiplier
    pct_change   : float  # % change from prev close
    rsi          : float
    float_small  : bool   # True if float < 10M shares
    penny_vote   : int    # +1 = penny, 0 = neutral, -1 = value


@dataclass
class RegimeState:
    """Current regime with stability tracking."""
    regime          : str    = 'NEUTRAL'
    confidence      : float  = 0.5    # 0.0 – 1.0
    cycles_held     : int    = 0
    penny_pressure  : float  = 0.0    # Rolling penny pressure 0-1
    value_pressure  : float  = 0.0    # Rolling value pressure 0-1
    active_catalysts: list   = field(default_factory=list)
    switched_at     : float  = field(default_factory=time.time)

    # Capital allocation per regime
    # PENNY_LEGEND: aggressive — up to 40% per position
    # VALUE_SCALPER: conservative — max 15% per position
    # NEUTRAL: moderate — 25% max
    max_position_pct: float  = 0.20


class ConsensusSwitcher:
    """
    Continuously monitors a basket of assets and votes on the current
    market regime. Uses a rolling window to avoid whipsawing.

    The switcher:
      1. Collects RegimeSignal from each scanned asset
      2. Runs a weighted majority vote over the last N cycles
      3. Emits a stable RegimeState that persists until evidence changes
      4. Adjusts position sizing limits and weight matrices accordingly
    """

    def __init__(self):
        self.state        = RegimeState()
        self._vote_history: deque = deque(maxlen=REGIME_HISTORY_LEN)
        self._signal_cache: dict  = {}  # symbol → RegimeSignal
        self._cycle_signals: list = []  # signals from current cycle

    # ─────────────────────────────────────────────────────────────────────
    # STEP 1: Collect per-asset regime signals
    # ─────────────────────────────────────────────────────────────────────
    def ingest_asset(
        self,
        symbol      : str,
        asset_type  : str,
        ohlcv       : list,
        prev_close  : float,
        float_shares: float = 0,
        volume_spike: float = 1.0,
    ):
        """
        Called for every asset scanned in a cycle.
        Computes that asset's contribution to the regime vote.
        """
        if len(ohlcv) < 10:
            return

        closes = np.array([c[4] for c in ohlcv], dtype=float)
        highs  = np.array([c[2] for c in ohlcv], dtype=float)
        lows   = np.array([c[3] for c in ohlcv], dtype=float)

        atr      = calculate_atr(highs, lows, closes)
        rsi      = calculate_rsi(closes)
        atr_pct  = atr / closes[-1] if closes[-1] > 0 else 0.0
        pct_chg  = ((closes[-1] - prev_close) / prev_close * 100
                    if prev_close > 0 else 0.0)

        penny_score = 0
        # Penny vote: every threshold hit adds +1
        if atr_pct >= PENNY_ATR_PCT_THRESHOLD : penny_score += 1
        if volume_spike >= PENNY_VOL_SPIKE_MIN  : penny_score += 1
        if abs(pct_chg) >= PENNY_SURGE_PCT_MIN  : penny_score += 1
        if float_shares > 0 and float_shares < 10_000_000: penny_score += 1

        # Value vote: opposite conditions
        value_score = 0
        if atr_pct <= VALUE_ATR_PCT_MAX         : value_score += 1
        if volume_spike < 2.0                   : value_score += 1
        if abs(pct_chg) < 3.0                   : value_score += 1
        if asset_type in ('forex',)             : value_score += 1

        vote = (1 if penny_score >= 2 else
                -1 if value_score >= 3 else 0)

        sig = RegimeSignal(
            symbol      = symbol,
            atr_pct     = atr_pct,
            vol_spike   = volume_spike,
            pct_change  = pct_chg,
            rsi         = rsi,
            float_small = (float_shares > 0 and float_shares < 10_000_000),
            penny_vote  = vote,
        )
        self._signal_cache[symbol] = sig
        self._cycle_signals.append(sig)

    # ─────────────────────────────────────────────────────────────────────
    # STEP 2: Tabulate vote and emit regime
    # ─────────────────────────────────────────────────────────────────────
    def compute_regime(self) -> RegimeState:
        """
        Aggregate all signals from this cycle into a regime vote.
        Apply the rolling history to avoid whipsawing.
        Call once per scan cycle after all ingest_asset() calls.
        """
        if not self._cycle_signals:
            self._cycle_signals = []
            return self.state   # No change

        # ── Raw vote from this cycle ──────────────────────────────────────
        penny_count = sum(1 for s in self._cycle_signals if s.penny_vote == 1)
        value_count = sum(1 for s in self._cycle_signals if s.penny_vote == -1)
        total       = len(self._cycle_signals)

        penny_pct   = penny_count / total if total else 0.0
        value_pct   = value_count / total if total else 0.0

        # Extra weight for multi-threshold assets (very clear penny signals)
        strong_penny = [s for s in self._cycle_signals
                        if s.atr_pct >= PENNY_ATR_PCT_THRESHOLD
                        and s.vol_spike >= PENNY_VOL_SPIKE_MIN]

        cycle_vote = ('PENNY_LEGEND'  if penny_pct >= 0.25 or len(strong_penny) >= PENNY_MIN_SIGNALS
                else  'VALUE_SCALPER' if value_pct >= 0.60
                else  'NEUTRAL')

        # ── Add to rolling history ────────────────────────────────────────
        self._vote_history.append(cycle_vote)

        # ── Majority over history window ──────────────────────────────────
        from collections import Counter
        vote_counts  = Counter(self._vote_history)
        history_vote = vote_counts.most_common(1)[0][0]
        confidence   = vote_counts[history_vote] / len(self._vote_history)

        # ── Regime stability: don't switch until MIN_HOLD_CYCLES confirms ─
        if history_vote != self.state.regime:
            # Count consecutive matching votes at end of history
            consecutive = 0
            for v in reversed(list(self._vote_history)):
                if v == history_vote:
                    consecutive += 1
                else:
                    break

            if consecutive >= REGIME_MIN_HOLD_CYCLES:
                # Switching regime
                old = self.state.regime
                self.state.regime      = history_vote
                self.state.cycles_held = 0
                self.state.switched_at = time.time()
                self.state.confidence  = confidence

                # Adjust max position size per regime
                self.state.max_position_pct = {
                    'PENNY_LEGEND' : 0.35,
                    'VALUE_SCALPER': 0.12,
                    'NEUTRAL'      : 0.20,
                }[history_vote]

                print(
                    f'\n  ◆ REGIME SWITCH: {old} → {history_vote} '
                    f'(confidence {confidence*100:.0f}%, '
                    f'max_pos={self.state.max_position_pct*100:.0f}%)\n'
                )
            # else: waiting for more confirmation — stay in current regime
        else:
            self.state.cycles_held += 1
            self.state.confidence   = confidence

        # ── Pressure indicators ───────────────────────────────────────────
        self.state.penny_pressure = round(penny_pct, 3)
        self.state.value_pressure = round(value_pct, 3)

        # ── Active catalysts (strongest penny signals this cycle) ─────────
        self.state.active_catalysts = [
            f'{s.symbol}: {s.pct_change:+.1f}% atr={s.atr_pct*100:.1f}% vol={s.vol_spike:.1f}×'
            for s in sorted(self._cycle_signals,
                            key=lambda x: x.vol_spike, reverse=True)[:3]
            if s.penny_vote == 1
        ]

        # ── Reset for next cycle ──────────────────────────────────────────
        self._cycle_signals = []

        return self.state

    def get_regime(self) -> str:
        return self.state.regime

    def get_position_limit(self) -> float:
        return self.state.max_position_pct

    def status_line(self) -> str:
        s = self.state
        return (
            f'REGIME={s.regime}  '
            f'conf={s.confidence*100:.0f}%  '
            f'held={s.cycles_held}  '
            f'penny_pressure={s.penny_pressure:.2f}  '
            f'value_pressure={s.value_pressure:.2f}  '
            f'max_pos={s.max_position_pct*100:.0f}%'
        )
