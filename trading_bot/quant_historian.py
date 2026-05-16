"""
╔══════════════════════════════════════════════════════════════════════╗
║  PERSONA 2 — THE QUANT HISTORIAN                                     ║
║  The Pattern Matcher                                                 ║
║                                                                      ║
║  Responsibilities:                                                   ║
║  • Maintain a rolling 90-day historical database of trade setups     ║
║  • When Listener flags an asset, instantly compute a probability     ║
║    score by cross-referencing current conditions vs. history         ║
║  • VETO the trade if historical win-rate < 82%                       ║
║  • Pass a scored TradeProposal to the Executioner if approved        ║
╚══════════════════════════════════════════════════════════════════════╝
"""

import json
import math
import os
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from indicators import (
    calculate_rsi, calculate_atr, calculate_vwap,
    vwap_deviation_pct, simulate_obi_from_candles,
)
from sentiment_listener import SentimentSignal

# ── Trade Proposal (contract between Historian → Executioner) ─────────────────
@dataclass
class TradeProposal:
    symbol           : str
    asset_type       : str
    direction        : str

    # Price context
    price            : float
    atr              : float
    rsi              : float
    vwap_dev         : float
    obi              : float

    # Historian verdict
    probability_score: float   # 0.0 – 1.0 (win-rate of similar setups)
    similar_trades   : int     # how many historical matches found
    approved         : bool    # False = veto

    # Sentiment from Listener
    sentiment_weight : float = 0.0
    volume_spike     : float = 1.0

    # Combined score passed to Executioner
    combined_score   : float = 0.0   # probability × sentiment amplifier

    timestamp        : float = field(default_factory=time.time)
    veto_reason      : str   = ''


# ── Feature Vector Definition ─────────────────────────────────────────────────
# Each historical trade is stored as a feature vector.
# Pattern matching finds setups where ALL features fall within a tolerance band.
#
# Feature                 Tolerance
# ──────────────────────  ─────────
# rsi_zone (bucketed)     exact match (bucket width = 10)
# vwap_dev (bucketed)     ±0.3%
# obi_zone (bucketed)     exact match (±0.1)
# hour_of_day             ±2 hours
# volume_spike_bucket     ±1 tier
# day_of_week             exact match
# asset_type              exact match
# direction               exact match

WIN_RATE_THRESHOLD  = 0.82   # 82% — veto if below
MIN_SAMPLE_SIZE     = 8      # Need at least 8 historical matches to trust the rate
DB_PATH             = './logs/trade_history.db'
HISTORY_DAYS        = 90


def _rsi_zone(rsi: float) -> int:
    """Bucket RSI into zones of width 10: 0–10→0, 10–20→1, ... 90–100→9."""
    return int(min(9, max(0, rsi // 10)))


def _vwap_bucket(dev: float) -> int:
    """
    Bucket VWAP deviation into 7 zones:
    ≤-2% → -3, -2 to -1% → -2, -1 to -0.3% → -1,
    ≈0% → 0, 0.3 to 1% → 1, 1 to 2% → 2, >2% → 3
    """
    if dev <= -2.0: return -3
    if dev <= -1.0: return -2
    if dev <= -0.3: return -1
    if dev <=  0.3: return  0
    if dev <=  1.0: return  1
    if dev <=  2.0: return  2
    return 3


def _obi_zone(obi: float) -> int:
    """OBI → -2 / -1 / 0 / +1 / +2 buckets."""
    if obi <= -0.35: return -2
    if obi <= -0.15: return -1
    if obi <=  0.15: return  0
    if obi <=  0.35: return  1
    return 2


def _vol_spike_bucket(spike: float) -> int:
    """1× → 0, 2× → 1, 3× → 2, 4× → 3, 5×+ → 4"""
    return min(4, max(0, int(spike) - 1))


class QuantHistorian:
    """
    Maintains a SQLite database of every trade outcome.
    On each signal, performs a pattern-similarity query and computes
    a rolling win rate for this exact setup type.

    Schema:
        trade_history(
            id INTEGER PK,
            symbol TEXT,
            asset_type TEXT,
            direction TEXT,
            rsi_zone INT,
            vwap_bucket INT,
            obi_zone INT,
            vol_spike_bucket INT,
            hour_of_day INT,
            day_of_week INT,
            sentiment_weight REAL,
            outcome_pnl REAL,     ← filled in when trade closes
            won INT,              ← 1 if profitable, 0 if loss
            opened_at REAL,
            closed_at REAL
        )
    """

    def __init__(self):
        self._init_db()

    def _init_db(self):
        os.makedirs('./logs', exist_ok=True)
        self.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
        self.conn.execute('PRAGMA journal_mode=WAL')  # non-blocking writes
        self.conn.execute('''
            CREATE TABLE IF NOT EXISTS trade_history (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                symbol           TEXT    NOT NULL,
                asset_type       TEXT    NOT NULL,
                direction        TEXT    NOT NULL,
                rsi_zone         INTEGER NOT NULL,
                vwap_bucket      INTEGER NOT NULL,
                obi_zone         INTEGER NOT NULL,
                vol_spike_bucket INTEGER NOT NULL,
                hour_of_day      INTEGER NOT NULL,
                day_of_week      INTEGER NOT NULL,
                sentiment_weight REAL    DEFAULT 0,
                outcome_pnl      REAL    DEFAULT NULL,
                won              INTEGER DEFAULT NULL,
                opened_at        REAL    NOT NULL,
                closed_at        REAL    DEFAULT NULL
            )
        ''')
        self.conn.execute('''
            CREATE INDEX IF NOT EXISTS idx_pattern
            ON trade_history(asset_type, direction, rsi_zone, vwap_bucket, obi_zone)
        ''')
        self.conn.commit()

    # ── Feature Extraction ─────────────────────────────────────────────────────
    def _extract_features(
        self,
        ohlcv           : list,
        sentiment_signal: SentimentSignal,
    ) -> dict:
        """Convert raw OHLCV + sentiment into a feature vector dict."""
        closes  = np.array([c[4] for c in ohlcv], dtype=float)
        highs   = np.array([c[2] for c in ohlcv], dtype=float)
        lows    = np.array([c[3] for c in ohlcv], dtype=float)
        vols    = np.array([c[5] for c in ohlcv], dtype=float)

        rsi      = calculate_rsi(closes)
        vwap     = calculate_vwap(highs, lows, closes, vols)
        vwap_dev = vwap_deviation_pct(closes[-1], vwap)
        obi      = simulate_obi_from_candles(closes, vols)
        atr      = calculate_atr(highs, lows, closes)

        import datetime
        now          = datetime.datetime.now()
        hour_of_day  = now.hour
        day_of_week  = now.weekday()  # 0=Mon, 6=Sun

        return {
            'rsi'             : rsi,
            'vwap_dev'        : vwap_dev,
            'obi'             : obi,
            'atr'             : atr,
            'price'           : float(closes[-1]),
            'rsi_zone'        : _rsi_zone(rsi),
            'vwap_bucket'     : _vwap_bucket(vwap_dev),
            'obi_zone'        : _obi_zone(obi),
            'vol_spike_bucket': _vol_spike_bucket(sentiment_signal.volume_spike),
            'hour_of_day'     : hour_of_day,
            'day_of_week'     : day_of_week,
            'sentiment_weight': sentiment_signal.sentiment_weight,
        }

    # ═══════════════════════════════════════════════════════════════════════════
    # CORE: Pattern-Similarity Win-Rate Query
    #
    # Matching logic (progressive relaxation):
    #   Tier 1 — strict: all 5 features match → use if N ≥ MIN_SAMPLE_SIZE
    #   Tier 2 — relaxed: drop hour_of_day, day_of_week constraints
    #   Tier 3 — loose:   only rsi_zone + vwap_bucket + direction
    #
    # We always prefer the tightest tier with enough samples.
    # ═══════════════════════════════════════════════════════════════════════════
    def _query_win_rate(
        self,
        asset_type      : str,
        direction       : str,
        rsi_zone        : int,
        vwap_bucket     : int,
        obi_zone        : int,
        vol_spike_bucket: int,
        hour_of_day     : int,
        day_of_week     : int,
    ) -> tuple[float, int, str]:
        """
        Returns (win_rate, sample_count, tier_used).
        Only considers trades from the last HISTORY_DAYS days.
        """
        cutoff = time.time() - (HISTORY_DAYS * 86400)
        base_where = '''
            WHERE asset_type = ?
              AND direction   = ?
              AND won IS NOT NULL
              AND opened_at  >= ?
        '''

        # Tier 1 — Full feature match
        rows = self.conn.execute(f'''
            SELECT COUNT(*), SUM(won) FROM trade_history
            {base_where}
              AND rsi_zone         = ?
              AND vwap_bucket      = ?
              AND obi_zone         = ?
              AND vol_spike_bucket = ?
              AND hour_of_day BETWEEN ? AND ?
              AND day_of_week      = ?
        ''', (
            asset_type, direction, cutoff,
            rsi_zone, vwap_bucket, obi_zone, vol_spike_bucket,
            max(0, hour_of_day - 2), min(23, hour_of_day + 2),
            day_of_week,
        )).fetchone()

        n, wins = rows[0] or 0, rows[1] or 0
        if n >= MIN_SAMPLE_SIZE:
            return round(wins / n, 4), n, 'TIER_1_STRICT'

        # Tier 2 — Relax time constraints
        rows = self.conn.execute(f'''
            SELECT COUNT(*), SUM(won) FROM trade_history
            {base_where}
              AND rsi_zone         = ?
              AND vwap_bucket      = ?
              AND obi_zone         = ?
              AND vol_spike_bucket IN (?, ?, ?)
        ''', (
            asset_type, direction, cutoff,
            rsi_zone, vwap_bucket, obi_zone,
            max(0, vol_spike_bucket - 1),
            vol_spike_bucket,
            min(4, vol_spike_bucket + 1),
        )).fetchone()

        n, wins = rows[0] or 0, rows[1] or 0
        if n >= MIN_SAMPLE_SIZE:
            return round(wins / n, 4), n, 'TIER_2_RELAXED'

        # Tier 3 — Minimal match
        rows = self.conn.execute(f'''
            SELECT COUNT(*), SUM(won) FROM trade_history
            {base_where}
              AND rsi_zone    = ?
              AND vwap_bucket IN (?, ?)
        ''', (
            asset_type, direction, cutoff,
            rsi_zone,
            vwap_bucket - 1 if vwap_bucket > -3 else vwap_bucket,
            vwap_bucket,
        )).fetchone()

        n, wins = rows[0] or 0, rows[1] or 0
        if n >= 3:   # Tier 3 needs fewer samples
            return round(wins / n, 4), n, 'TIER_3_LOOSE'

        return 0.0, 0, 'NO_DATA'

    # ── Probability Score Calculation ─────────────────────────────────────────
    def _combined_score(
        self,
        prob_score      : float,
        sentiment_weight: float,
        volume_spike    : float,
        sample_size     : int,
    ) -> float:
        """
        Combined score passed to Executioner.

        Formula:
          combined = prob_score
                   × (1 + sentiment_boost)
                   × volume_factor
                   × confidence_factor

          sentiment_boost  = sentiment_weight × 0.15 (max ±15% adjustment)
          volume_factor    = 1.0 + min(0.2, (spike - 1) × 0.05)
          confidence_factor= min(1.0, sample_size / 30)  (shrinks if few samples)
        """
        sentiment_boost   = sentiment_weight * 0.15
        volume_factor     = 1.0 + min(0.20, (volume_spike - 1.0) * 0.05)
        confidence_factor = min(1.0, sample_size / 30.0)

        score = prob_score * (1 + sentiment_boost) * volume_factor * confidence_factor
        return round(min(1.0, max(0.0, score)), 4)

    # ── Main: Evaluate Signal ─────────────────────────────────────────────────
    def evaluate(
        self,
        sentiment_signal: SentimentSignal,
        ohlcv           : list,
    ) -> TradeProposal:
        """
        Cross-references the live signal against 90-day history.
        Returns a TradeProposal with approved=True/False.
        """
        if sentiment_signal.direction == 'NEUTRAL':
            return TradeProposal(
                symbol=sentiment_signal.symbol,
                asset_type=sentiment_signal.asset_type,
                direction='NEUTRAL',
                price=0.0, atr=0.0, rsi=50.0, vwap_dev=0.0, obi=0.0,
                probability_score=0.0, similar_trades=0,
                approved=False, veto_reason='Neutral sentiment — no signal',
            )

        feat = self._extract_features(ohlcv, sentiment_signal)

        win_rate, sample_n, tier = self._query_win_rate(
            asset_type       = sentiment_signal.asset_type,
            direction        = sentiment_signal.direction,
            rsi_zone         = feat['rsi_zone'],
            vwap_bucket      = feat['vwap_bucket'],
            obi_zone         = feat['obi_zone'],
            vol_spike_bucket = feat['vol_spike_bucket'],
            hour_of_day      = feat['hour_of_day'],
            day_of_week      = feat['day_of_week'],
        )

        combined = self._combined_score(
            win_rate, sentiment_signal.sentiment_weight,
            sentiment_signal.volume_spike, sample_n
        )

        # ── Veto Logic ───────────────────────────────────────────────────────
        approved     = True
        veto_reason  = ''

        if sample_n == 0 or tier == 'NO_DATA':
            # First time we've seen this setup type → allow with reduced conviction
            # The Executioner will use minimum position size
            approved = True
            veto_reason = f'NEW_SETUP (no history) — using min size'
            win_rate = 0.50  # Treat as coin-flip until data accumulates
            combined = combined * 0.5  # Halve the combined score for safety

        elif win_rate < WIN_RATE_THRESHOLD:
            approved    = False
            veto_reason = (
                f'Win rate {win_rate*100:.1f}% < {WIN_RATE_THRESHOLD*100:.0f}% threshold '
                f'({sample_n} samples via {tier})'
            )

        # RSI extremes: refuse counter-trend trades with bad history
        if approved:
            if sentiment_signal.direction == 'LONG' and feat['rsi'] > 80:
                if win_rate < 0.88:  # Tighter threshold for extremely overbought
                    approved    = False
                    veto_reason = f'RSI {feat["rsi"]:.1f} extreme overbought — LONG veto'

            elif sentiment_signal.direction == 'SHORT' and feat['rsi'] < 20:
                if win_rate < 0.88:
                    approved    = False
                    veto_reason = f'RSI {feat["rsi"]:.1f} extreme oversold — SHORT veto'

        return TradeProposal(
            symbol            = sentiment_signal.symbol,
            asset_type        = sentiment_signal.asset_type,
            direction         = sentiment_signal.direction,
            price             = feat['price'],
            atr               = feat['atr'],
            rsi               = feat['rsi'],
            vwap_dev          = feat['vwap_dev'],
            obi               = feat['obi'],
            probability_score = win_rate,
            similar_trades    = sample_n,
            approved          = approved,
            sentiment_weight  = sentiment_signal.sentiment_weight,
            volume_spike      = sentiment_signal.volume_spike,
            combined_score    = combined,
            veto_reason       = veto_reason,
        )

    # ── Outcome Recording ─────────────────────────────────────────────────────
    def record_open(
        self,
        proposal  : TradeProposal,
    ) -> int:
        """
        Insert a pending trade into history. Returns the row ID
        so the engine can update the outcome when the trade closes.
        """
        feat = {
            'rsi_zone'        : _rsi_zone(proposal.rsi),
            'vwap_bucket'     : _vwap_bucket(proposal.vwap_dev),
            'obi_zone'        : _obi_zone(proposal.obi),
            'vol_spike_bucket': _vol_spike_bucket(proposal.volume_spike),
        }
        import datetime
        now = datetime.datetime.now()

        cursor = self.conn.execute('''
            INSERT INTO trade_history
            (symbol, asset_type, direction,
             rsi_zone, vwap_bucket, obi_zone, vol_spike_bucket,
             hour_of_day, day_of_week, sentiment_weight, opened_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ''', (
            proposal.symbol, proposal.asset_type, proposal.direction,
            feat['rsi_zone'], feat['vwap_bucket'],
            feat['obi_zone'], feat['vol_spike_bucket'],
            now.hour, now.weekday(),
            proposal.sentiment_weight,
            time.time(),
        ))
        self.conn.commit()
        return cursor.lastrowid

    def record_close(self, row_id: int, outcome_pnl: float):
        """Mark a trade as closed and record the P&L outcome."""
        won = 1 if outcome_pnl > 0 else 0
        self.conn.execute('''
            UPDATE trade_history
            SET outcome_pnl = ?, won = ?, closed_at = ?
            WHERE id = ?
        ''', (round(outcome_pnl, 6), won, time.time(), row_id))
        self.conn.commit()

    # ── Analytics ─────────────────────────────────────────────────────────────
    def get_overall_stats(self) -> dict:
        """Global win rate and P&L stats from the database."""
        cutoff = time.time() - (HISTORY_DAYS * 86400)
        row = self.conn.execute('''
            SELECT
                COUNT(*)                           AS total,
                SUM(won)                           AS wins,
                ROUND(AVG(outcome_pnl), 4)         AS avg_pnl,
                ROUND(SUM(outcome_pnl), 4)         AS total_pnl,
                ROUND(MAX(outcome_pnl), 4)         AS best_trade,
                ROUND(MIN(outcome_pnl), 4)         AS worst_trade
            FROM trade_history
            WHERE won IS NOT NULL AND opened_at >= ?
        ''', (cutoff,)).fetchone()

        total, wins, avg_pnl, total_pnl, best, worst = row
        total = total or 0
        wins  = wins  or 0
        return {
            'total_trades' : total,
            'wins'         : wins,
            'losses'       : total - wins,
            'win_rate'     : round(wins / total * 100, 1) if total else 0.0,
            'avg_pnl'      : avg_pnl or 0.0,
            'total_pnl'    : total_pnl or 0.0,
            'best_trade'   : best or 0.0,
            'worst_trade'  : worst or 0.0,
        }

    def best_setups(self, limit: int = 5) -> list[dict]:
        """Return the highest win-rate setups in the database."""
        cutoff = time.time() - (HISTORY_DAYS * 86400)
        rows = self.conn.execute('''
            SELECT asset_type, direction, rsi_zone, vwap_bucket,
                   COUNT(*) AS n,
                   ROUND(AVG(won) * 100, 1) AS win_rate_pct,
                   ROUND(AVG(outcome_pnl), 4) AS avg_pnl
            FROM trade_history
            WHERE won IS NOT NULL AND opened_at >= ?
            GROUP BY asset_type, direction, rsi_zone, vwap_bucket
            HAVING n >= ?
            ORDER BY win_rate_pct DESC, avg_pnl DESC
            LIMIT ?
        ''', (cutoff, MIN_SAMPLE_SIZE, limit)).fetchall()

        return [
            {
                'asset_type'  : r[0],
                'direction'   : r[1],
                'rsi_zone'    : f'{r[2]*10}–{r[2]*10+10}',
                'vwap_bucket' : r[3],
                'sample_size' : r[4],
                'win_rate'    : r[5],
                'avg_pnl'     : r[6],
            }
            for r in rows
        ]
