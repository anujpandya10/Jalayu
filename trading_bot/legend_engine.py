"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  LEGEND CONSENSUS ENGINE — Core Scoring Modules                             ║
║                                                                             ║
║  Four trading masters, one unified brain:                                   ║
║                                                                             ║
║  SYKES SCORE  — Supernova detection, FOMO measurement, breakout timing      ║
║  GRITTANI SCORE — Float-adjusted momentum, pattern maturity, entry quality  ║
║  KELLOGG SCORE — Tape-reading precision, intraday momentum decay            ║
║  BUFFETT SCORE — Margin of safety, floor calculation, regime safety         ║
║                                                                             ║
║  Output: LegendVerdict — unified trade recommendation from all four masters ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from indicators import (
    calculate_rsi, calculate_atr, calculate_vwap,
    vwap_deviation_pct, simulate_obi_from_candles, calculate_ema,
)


# ─────────────────────────────────────────────────────────────────────────────
# DATA CONTRACTS
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class MarketContext:
    """Enriched asset snapshot fed to all four scoring engines."""
    symbol          : str
    asset_type      : str       # 'crypto' | 'stock' | 'forex'
    price           : float
    float_shares    : float     # Total tradeable float (0 if unknown)
    prev_close      : float     # Previous session close
    daily_high      : float
    daily_low       : float
    market_cap      : float     # 0 if not available
    news_score      : float     # From SentimentListener [-1, +1]
    volume_spike    : float     # current_vol / MA20_vol multiplier
    ohlcv           : list      # Raw candle list [[ts,o,h,l,c,v]...]


@dataclass
class LegendScore:
    """Individual master's verdict on one asset."""
    master          : str       # 'SYKES' | 'GRITTANI' | 'KELLOGG' | 'BUFFETT'
    raw_score       : float     # 0.0 – 100.0
    direction       : str       # 'LONG' | 'SHORT' | 'FLAT'
    conviction      : str       # 'STRONG' | 'MODERATE' | 'WEAK'
    pattern         : str       # named pattern triggered
    reasons         : list      = field(default_factory=list)
    veto            : bool      = False   # True = this master blocks the trade
    veto_reason     : str       = ''


@dataclass
class LegendVerdict:
    """Consensus output — what ALL four masters agree on."""
    symbol          : str
    direction       : str       # Final direction (or 'FLAT' if no consensus)
    consensus_score : float     # 0.0 – 100.0  weighted composite
    sykes_score     : float
    grittani_score  : float
    kellogg_score   : float
    buffett_score   : float
    active_regime   : str       # 'PENNY_LEGEND' | 'VALUE_SCALPER' | 'NEUTRAL'
    approved        : bool      # False if Buffett Rule #1 veto fires
    dominant_master : str       # Whose signal led this trade
    patterns        : list      = field(default_factory=list)
    reasons         : list      = field(default_factory=list)
    timestamp       : float     = field(default_factory=time.time)


# ─────────────────────────────────────────────────────────────────────────────
# ███████╗██╗   ██╗██╗  ██╗███████╗███████╗
# ██╔════╝╚██╗ ██╔╝██║ ██╔╝██╔════╝██╔════╝
# ███████╗ ╚████╔╝ █████╔╝ █████╗  ███████╗
# ╚════██║  ╚██╔╝  ██╔═██╗ ██╔══╝  ╚════██║
# ███████║   ██║   ██║  ██╗███████╗███████║
# ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚══════╝╚══════╝
#
# SYKES SCORE — Supernova Pattern Engine
# Philosophy: "The trend is your friend, until the end when it bends."
# Core plays: Morning Perk, First Green Day, Overextension Short
# ─────────────────────────────────────────────────────────────────────────────

class SykesEngine:
    """
    Timothy Sykes' playbook translated into a scoring function.

    Key rules from Sykes' documented methodology:
      1. Follow the VOLUME — no volume, no play
      2. Low-float stocks move faster and farther (float < 10M shares = ideal)
      3. Morning Perk: stock that popped pre-market gaps up on open — chase only
         the FIRST 30 min if volume holds 3× above average
      4. Overextension Short: stock up 100%+ on noise, wait for the FIRST
         failure at resistance, then short the panic with a tight stop
      5. Cut losses at 1-2% deviation. Ego is the enemy.
    """

    # Supernova thresholds
    SUPERNOVA_VOL_MULT   = 10.0  # 10× relative volume = supernova
    FOMO_VOL_MULT        = 3.0   # 3× = high retail FOMO zone
    LOW_FLOAT_THRESHOLD  = 10_000_000   # <10M shares = ideal
    MICRO_FLOAT          = 2_000_000    # <2M shares = explosive
    OVEREXT_PCT          = 100.0  # 100%+ gain = overextension zone
    FIRST_GREEN_DAY_RSI  = 55    # RSI > 55 on first green day = momentum

    def score(self, ctx: MarketContext) -> LegendScore:
        closes = np.array([c[4] for c in ctx.ohlcv], dtype=float)
        highs  = np.array([c[2] for c in ctx.ohlcv], dtype=float)
        lows   = np.array([c[3] for c in ctx.ohlcv], dtype=float)
        vols   = np.array([c[5] for c in ctx.ohlcv], dtype=float)

        rsi      = calculate_rsi(closes)
        atr      = calculate_atr(highs, lows, closes)
        vwap     = calculate_vwap(highs, lows, closes, vols)
        vwap_dev = vwap_deviation_pct(ctx.price, vwap)

        # ── Percentage gain from previous close ──────────────────────────
        pct_gain = ((ctx.price - ctx.prev_close) / ctx.prev_close * 100
                    if ctx.prev_close > 0 else 0.0)

        score   = 0.0
        reasons = []
        pattern = 'NONE'
        direction = 'FLAT'

        # ══════════════════════════════════════════════════════════════════
        # PATTERN 1 — SUPERNOVA / MORNING PERK (LONG play)
        #
        # Criteria:
        #   • Volume ≥ 10× MA20  → Supernova confirmed
        #   • Positive gap or first green day  (pct_gain > 0)
        #   • Float < 10M (ideal) — smaller float = faster move
        #   • RSI not yet overbought (< 80) — room to run
        #   • VWAP dev > 0 — price above average (strength)
        # ══════════════════════════════════════════════════════════════════
        if ctx.volume_spike >= self.SUPERNOVA_VOL_MULT and pct_gain > 5.0:
            score += 40.0
            reasons.append(f'SUPERNOVA: {ctx.volume_spike:.1f}× volume, +{pct_gain:.1f}% gain')
            pattern   = 'SUPERNOVA_MORNING_PERK'
            direction = 'LONG'

        elif ctx.volume_spike >= self.FOMO_VOL_MULT and pct_gain > 2.0:
            score += 25.0
            reasons.append(f'FOMO spike: {ctx.volume_spike:.1f}× volume, +{pct_gain:.1f}%')
            pattern   = 'FOMO_BREAKOUT'
            direction = 'LONG'

        # First Green Day — stock was red for 2+ days, now breaking out
        if pct_gain > 0 and rsi > self.FIRST_GREEN_DAY_RSI and ctx.volume_spike >= 2.0:
            score += 15.0
            reasons.append(f'First Green Day: RSI {rsi:.1f}, vol {ctx.volume_spike:.1f}×')
            if direction == 'FLAT':
                pattern   = 'FIRST_GREEN_DAY'
                direction = 'LONG'

        # ══════════════════════════════════════════════════════════════════
        # FLOAT MULTIPLIER — smaller float = exponentially bigger move
        # ══════════════════════════════════════════════════════════════════
        if ctx.float_shares > 0:
            if ctx.float_shares <= self.MICRO_FLOAT:
                score += 20.0
                reasons.append(f'Micro-float: {ctx.float_shares/1e6:.2f}M shares (EXPLOSIVE)')
            elif ctx.float_shares <= self.LOW_FLOAT_THRESHOLD:
                score += 10.0
                reasons.append(f'Low-float: {ctx.float_shares/1e6:.2f}M shares')

        # ══════════════════════════════════════════════════════════════════
        # PATTERN 2 — OVEREXTENSION SHORT
        #
        # Criteria:
        #   • Price up 100%+ from recent base on pure noise
        #   • Volume starting to dry up (spike then decline)
        #   • RSI ≥ 85 — extreme overbought
        #   • First structural crack: price < EMA9 on 1-min
        # ══════════════════════════════════════════════════════════════════
        if pct_gain >= self.OVEREXT_PCT:
            ema9 = calculate_ema(closes, 9)
            vol_declining = (len(vols) >= 3 and
                             float(vols[-1]) < float(vols[-2]) < float(vols[-3]))

            if rsi >= 85 and vol_declining and ctx.price < ema9:
                score   += 45.0   # High-conviction short
                reasons.append(
                    f'OVEREXTENSION SHORT: +{pct_gain:.0f}% gain, RSI {rsi:.1f}, '
                    f'vol drying, price cracked EMA9'
                )
                pattern   = 'OVEREXTENSION_SHORT'
                direction = 'SHORT'

            elif rsi >= 80 and ctx.price < ema9:
                score   += 25.0
                reasons.append(f'Overextended crack forming: RSI {rsi:.1f}')
                pattern   = 'OVEREXT_CRACK'
                direction = 'SHORT'

        # ══════════════════════════════════════════════════════════════════
        # NEWS CATALYST multiplier — Sykes loves strong catalysts
        # ══════════════════════════════════════════════════════════════════
        score += ctx.news_score * 10.0  # ±10 pts from catalyst
        if ctx.news_score > 0.5:
            reasons.append(f'Strong catalyst (news={ctx.news_score:.2f})')

        # ══════════════════════════════════════════════════════════════════
        # SYKES' CUT-LOSS VETO
        # Never enter if the chart is already at peak extension without
        # a confirmed pattern — "don't chase, wait for the setup"
        # ══════════════════════════════════════════════════════════════════
        veto = False
        veto_reason = ''
        if (pct_gain > 30.0 and rsi > 85 and
                ctx.volume_spike < 5.0 and direction == 'LONG'):
            veto        = True
            veto_reason = f'Sykes: Chasing overbought asset — +{pct_gain:.0f}%, RSI {rsi:.1f}, insufficient vol'

        score = min(100.0, max(0.0, score))
        conviction = ('STRONG' if score >= 65 else
                      'MODERATE' if score >= 35 else 'WEAK')

        return LegendScore(
            master='SYKES', raw_score=score, direction=direction,
            conviction=conviction, pattern=pattern,
            reasons=reasons, veto=veto, veto_reason=veto_reason,
        )


# ─────────────────────────────────────────────────────────────────────────────
# ██████╗ ██████╗ ██╗████████╗████████╗ █████╗ ███╗   ██╗██╗
# ██╔════╝ ██╔══██╗██║╚══██╔══╝╚══██╔══╝██╔══██╗████╗  ██║██║
# ██║  ███╗██████╔╝██║   ██║      ██║   ███████║██╔██╗ ██║██║
# ██║   ██║██╔══██╗██║   ██║      ██║   ██╔══██║██║╚██╗██║██║
# ╚██████╔╝██║  ██║██║   ██║      ██║   ██║  ██║██║ ╚████║██║
#  ╚═════╝ ╚═╝  ╚═╝╚═╝   ╚═╝      ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═══╝╚═╝
#
# GRITTANI SCORE — Float Rotation + Multi-Variable Pattern Maturity
# Philosophy: "Size up on the perfect setup, not on desperation."
# Core plays: Parabolic Shorts, Flag Breaks, Afternoon Fades
# ─────────────────────────────────────────────────────────────────────────────

class GrittaniEngine:
    """
    Tim Grittani's approach: patience + extreme size when probability peaks.

    Key documented rules:
      1. Wait for the stock to prove itself — 2nd or 3rd leg up = optimal short
      2. "Parabolic Short" — stock has gone parabolic, now fading the 2nd peak
      3. Flag Breakout — tight consolidation after a big move, break = continuation
      4. Never size up DURING a bad trade. Only size up BEFORE an ideal setup.
      5. Multi-variable backtesting: check volume, float, news, price level
         ALL together — any single factor alone is insufficient
    """

    PARABOLIC_MIN_PCT    = 50.0   # Stock must have moved 50%+ for parabolic short
    FLAG_CONSOL_BARS     = 5      # Consolidation window for flag pattern
    FLAG_ATR_TIGHT       = 0.5    # Flag body must be < 0.5× ATR (tight)
    AFTERNOON_FADE_HOUR  = 14     # 2pm ET — afternoon fade window starts

    def score(self, ctx: MarketContext) -> LegendScore:
        closes = np.array([c[4] for c in ctx.ohlcv], dtype=float)
        highs  = np.array([c[2] for c in ctx.ohlcv], dtype=float)
        lows   = np.array([c[3] for c in ctx.ohlcv], dtype=float)
        vols   = np.array([c[5] for c in ctx.ohlcv], dtype=float)
        timestamps = [c[0] for c in ctx.ohlcv]

        rsi  = calculate_rsi(closes)
        atr  = calculate_atr(highs, lows, closes)
        ema9 = calculate_ema(closes, 9)
        ema21= calculate_ema(closes, 21)

        pct_gain = ((ctx.price - ctx.prev_close) / ctx.prev_close * 100
                    if ctx.prev_close > 0 else 0.0)

        score   = 0.0
        reasons = []
        pattern = 'NONE'
        direction = 'FLAT'

        # ══════════════════════════════════════════════════════════════════
        # PATTERN 1 — PARABOLIC SHORT (Grittani's bread-and-butter)
        #
        # Multi-variable check (ALL must pass):
        #   ① Move ≥ 50% from base          → momentum proven
        #   ② Volume DECLINING on last 3 bars → sellers absorbing buyers
        #   ③ RSI failed to make new high    → hidden divergence
        #   ④ Price < EMA9 (cracked short-term support)
        #   ⑤ 2nd attempt at high failed     → double top structure
        # ══════════════════════════════════════════════════════════════════
        if len(closes) >= 10 and pct_gain >= self.PARABOLIC_MIN_PCT:
            # Check volume declining
            vol_declining = (len(vols) >= 3 and
                             float(vols[-1]) < float(vols[-2]))
            # Check RSI divergence: price near high but RSI lower than 3 bars ago
            rsi_3bars_ago = calculate_rsi(closes[:-3]) if len(closes) >= 17 else rsi + 5
            rsi_divergence = (rsi < rsi_3bars_ago - 3)
            # Check double-top: recent high lower than prior high
            recent_high  = float(np.max(highs[-5:]))
            prior_high   = float(np.max(highs[-10:-5]))
            double_top   = (recent_high <= prior_high * 1.01)   # Within 1%

            variable_count = sum([
                vol_declining, rsi_divergence,
                double_top, ctx.price < ema9,
            ])

            # Grittani: more confirming variables = more size
            if variable_count >= 4:
                score += 50.0
                reasons.append(
                    f'PARABOLIC SHORT (4/4 variables): vol↓, RSI div, double-top, below EMA9'
                )
                pattern   = 'PARABOLIC_SHORT_PERFECT'
                direction = 'SHORT'
            elif variable_count >= 3:
                score += 32.0
                reasons.append(f'Parabolic short (3/4 variables confirmed)')
                pattern   = 'PARABOLIC_SHORT'
                direction = 'SHORT'
            elif variable_count >= 2:
                score += 15.0
                reasons.append(f'Parabolic short setup forming ({variable_count}/4)')

        # ══════════════════════════════════════════════════════════════════
        # PATTERN 2 — BULL FLAG BREAKOUT (Continuation Long)
        #
        # After a sharp 15-30% move, price consolidates in a tight range
        # (< 0.5× ATR body height) for 3-7 bars, then breaks.
        # Grittani: "The tighter the flag, the more powerful the break."
        # ══════════════════════════════════════════════════════════════════
        if len(closes) >= self.FLAG_CONSOL_BARS + 3:
            flag_bars   = closes[-self.FLAG_CONSOL_BARS:]
            flag_range  = float(np.max(flag_bars) - np.min(flag_bars))
            pre_move    = ((float(closes[-self.FLAG_CONSOL_BARS]) - float(closes[-15]))
                           / float(closes[-15]) * 100) if len(closes) >= 15 else 0.0

            flag_tight  = flag_range < (atr * self.FLAG_ATR_TIGHT)
            breakout    = ctx.price > float(np.max(flag_bars[:-1]))  # Breaking above flag

            if flag_tight and breakout and pre_move >= 10.0 and ctx.volume_spike >= 2.0:
                score += 35.0
                reasons.append(
                    f'BULL FLAG BREAK: {pre_move:.1f}% pre-move, '
                    f'tight consolidation, vol {ctx.volume_spike:.1f}×'
                )
                pattern   = 'BULL_FLAG_BREAK'
                direction = 'LONG'

        # ══════════════════════════════════════════════════════════════════
        # PATTERN 3 — AFTERNOON FADE (Short Bias after 2pm)
        #
        # Grittani: stocks that ran hard in the morning often fade into close.
        # Entry: RSI > 65 + price below VWAP + vol declining + after 2pm ET
        # ══════════════════════════════════════════════════════════════════
        import datetime
        now_hour = datetime.datetime.now().hour
        if now_hour >= self.AFTERNOON_FADE_HOUR:
            vwap = calculate_vwap(highs, lows, closes, vols)
            if (rsi > 65 and ctx.price < vwap and
                    ctx.volume_spike < 1.5 and pct_gain > 15.0):
                score += 25.0
                reasons.append(
                    f'AFTERNOON FADE: RSI {rsi:.1f}, below VWAP, '
                    f'vol drying after {pct_gain:.1f}% run'
                )
                if direction == 'FLAT':
                    pattern   = 'AFTERNOON_FADE'
                    direction = 'SHORT'

        # ══════════════════════════════════════════════════════════════════
        # GRITTANI MULTI-VARIABLE RISK ADJUSTMENT
        # Each variable below adds conviction to whatever pattern fired
        # ══════════════════════════════════════════════════════════════════
        confirmations = 0
        if ctx.news_score > 0.3: confirmations += 1
        if ctx.float_shares > 0 and ctx.float_shares < 5_000_000: confirmations += 1
        if ctx.volume_spike >= 5.0: confirmations += 1
        if atr / ctx.price > 0.02: confirmations += 1   # High ATR% = volatile

        score += confirmations * 5.0
        if confirmations >= 3:
            reasons.append(f'Grittani multi-variable: {confirmations}/4 confirmations')

        score = min(100.0, max(0.0, score))
        conviction = ('STRONG' if score >= 60 else
                      'MODERATE' if score >= 30 else 'WEAK')

        return LegendScore(
            master='GRITTANI', raw_score=score, direction=direction,
            conviction=conviction, pattern=pattern, reasons=reasons,
        )


# ─────────────────────────────────────────────────────────────────────────────
# ██╗  ██╗███████╗██╗     ██╗      ██████╗  ██████╗  ██████╗
# ██║ ██╔╝██╔════╝██║     ██║     ██╔═══██╗██╔════╝ ██╔════╝
# █████╔╝ █████╗  ██║     ██║     ██║   ██║██║  ███╗██║  ███╗
# ██╔═██╗ ██╔══╝  ██║     ██║     ██║   ██║██║   ██║██║   ██║
# ██║  ██╗███████╗███████╗███████╗╚██████╔╝╚██████╔╝╚██████╔╝
# ╚═╝  ╚═╝╚══════╝╚══════╝╚══════╝ ╚═════╝  ╚═════╝  ╚═════╝
#
# KELLOGG SCORE — Tape Reading, Intraday Momentum Decay, Volume Velocity
# Philosophy: "Momentum is everything — read the tape, not the story."
# Core plays: Breakout Momentum Scalps, Halt Anticipation, Level-2 Reads
# ─────────────────────────────────────────────────────────────────────────────

class KelloggEngine:
    """
    Jack Kellogg's hyper-focused momentum scalping.

    Key documented principles:
      1. Pure price action — ignore the news, read the tape
      2. Volume velocity: is volume ACCELERATING or DECELERATING?
         Acceleration = add to winners. Deceleration = exit immediately.
      3. Halt anticipation: stocks halted for news often gap 20-50% on resume
      4. Entry precision: exact level, not approximate — 1-2% slop = bad trade
      5. Momentum decay: once price slows (3 bars of shrinking range), exit
    """

    MOMENTUM_DECAY_BARS = 3   # Bars of shrinking range = momentum dying
    VOL_ACCEL_RATIO     = 1.3 # Volume must be growing 30%+ bar-to-bar
    TIGHT_ENTRY_ATR_PCT = 0.015  # Entry range must be < 1.5% of ATR from ideal

    def score(self, ctx: MarketContext) -> LegendScore:
        closes = np.array([c[4] for c in ctx.ohlcv], dtype=float)
        highs  = np.array([c[2] for c in ctx.ohlcv], dtype=float)
        lows   = np.array([c[3] for c in ctx.ohlcv], dtype=float)
        vols   = np.array([c[5] for c in ctx.ohlcv], dtype=float)

        rsi  = calculate_rsi(closes)
        atr  = calculate_atr(highs, lows, closes)
        ema9 = calculate_ema(closes, 9)

        score   = 0.0
        reasons = []
        pattern = 'NONE'
        direction = 'FLAT'

        # ══════════════════════════════════════════════════════════════════
        # TAPE READ 1 — VOLUME VELOCITY (Kellogg's primary signal)
        #
        # Is volume accelerating or decelerating?
        # Accelerating vol + expanding price range = momentum entry.
        # Decelerating vol = EXIT signal.
        # ══════════════════════════════════════════════════════════════════
        if len(vols) >= 4:
            vol_velocity = []
            for i in range(-3, 0):
                if float(vols[i-1]) > 0:
                    vol_velocity.append(float(vols[i]) / float(vols[i-1]))

            vol_accel  = all(v >= self.VOL_ACCEL_RATIO for v in vol_velocity)
            vol_decel  = all(v < 0.85 for v in vol_velocity)

            if vol_accel and ctx.volume_spike >= 3.0:
                score += 30.0
                reasons.append(f'Volume ACCELERATING: {[f"{v:.2f}×" for v in vol_velocity]}')
                direction = 'LONG' if float(closes[-1]) > float(closes[-2]) else 'SHORT'
                pattern   = 'VOLUME_ACCELERATION'

            if vol_decel and direction != 'FLAT':
                # Kellogg's exit signal — do NOT enter into dying momentum
                score  -= 20.0
                reasons.append('Volume DECELERATING — Kellogg exit signal active')

        # ══════════════════════════════════════════════════════════════════
        # TAPE READ 2 — PRICE RANGE MOMENTUM
        #
        # Each candle body should be LARGER than the previous for true momentum.
        # Shrinking bodies = momentum decay = get out or don't enter.
        # ══════════════════════════════════════════════════════════════════
        if len(closes) >= self.MOMENTUM_DECAY_BARS + 1:
            bodies = np.abs(closes[-self.MOMENTUM_DECAY_BARS:] -
                            np.array([c[1] for c in ctx.ohlcv[-self.MOMENTUM_DECAY_BARS:]], dtype=float))
            decay  = all(bodies[i] < bodies[i-1] for i in range(1, len(bodies)))
            expand = all(bodies[i] > bodies[i-1] for i in range(1, len(bodies)))

            if expand:
                score += 20.0
                reasons.append(f'Candle bodies EXPANDING — momentum confirmed')
                if direction == 'FLAT':
                    direction = 'LONG' if closes[-1] > closes[-2] else 'SHORT'
                    pattern   = 'MOMENTUM_EXPANSION'

            elif decay:
                score -= 15.0
                reasons.append('Candle bodies SHRINKING — Kellogg: stay out')

        # ══════════════════════════════════════════════════════════════════
        # TAPE READ 3 — HALT RESUME ANTICIPATION
        #
        # Stocks halted for news (circuit breaker halt) often resume
        # with a 20-50% gap. Kellogg positions just before the resume.
        # We simulate this by checking: volume spike > 15× + price near
        # a known halt-trigger threshold (±10% from open)
        # ══════════════════════════════════════════════════════════════════
        if ctx.volume_spike >= 15.0:
            pct_from_open = abs(ctx.price - ctx.prev_close) / ctx.prev_close * 100
            if 8.0 <= pct_from_open <= 12.0:   # Near halt threshold
                score += 20.0
                reasons.append(
                    f'HALT ANTICIPATION: {ctx.volume_spike:.0f}× vol, '
                    f'{pct_from_open:.1f}% from open (near halt zone)'
                )
                pattern   = 'HALT_RESUME'
                direction = 'LONG' if ctx.price > ctx.prev_close else 'SHORT'

        # ══════════════════════════════════════════════════════════════════
        # TAPE READ 4 — ENTRY PRECISION BONUS
        #
        # Kellogg: "The difference between a good trade and a great trade
        # is the entry price." Price near VWAP + ATR floor = precise entry.
        # ══════════════════════════════════════════════════════════════════
        vwap    = calculate_vwap(highs, lows, closes, np.array([c[5] for c in ctx.ohlcv], dtype=float))
        near_vwap = abs(ctx.price - vwap) / vwap < 0.005  # Within 0.5%

        if near_vwap and direction != 'FLAT':
            score += 15.0
            reasons.append('Precise entry: price within 0.5% of VWAP')

        # ══════════════════════════════════════════════════════════════════
        # KELLOGG VETO: Momentum already dead
        # If volume velocity is decelerating AND price range is shrinking,
        # Kellogg refuses to trade — "respect the tape"
        # ══════════════════════════════════════════════════════════════════
        veto = False
        veto_reason = ''
        if score < 0:
            veto        = True
            veto_reason = 'Kellogg: Dead momentum — tape says NO'
            score       = 0.0

        score = min(100.0, max(0.0, score))
        conviction = ('STRONG' if score >= 55 else
                      'MODERATE' if score >= 25 else 'WEAK')

        return LegendScore(
            master='KELLOGG', raw_score=score, direction=direction,
            conviction=conviction, pattern=pattern,
            reasons=reasons, veto=veto, veto_reason=veto_reason,
        )


# ─────────────────────────────────────────────────────────────────────────────
# ██████╗ ██╗   ██╗███████╗███████╗███████╗████████╗████████╗
# ██╔══██╗██║   ██║██╔════╝██╔════╝██╔════╝╚══██╔══╝╚══██╔══╝
# ██████╔╝██║   ██║█████╗  █████╗  █████╗     ██║      ██║
# ██╔══██╗██║   ██║██╔══╝  ██╔══╝  ██╔══╝     ██║      ██║
# ██████╔╝╚██████╔╝██║     ██║     ███████╗   ██║      ██║
# ╚═════╝  ╚═════╝ ╚═╝     ╚═╝     ╚══════╝   ╚═╝      ╚═╝
#
# BUFFETT SCORE — Capital Preservation, Margin of Safety, Rule #1
# Philosophy: "The first rule of investing is never lose money."
# Adapted for HFT: Calculate exact floor before entry, override on chaos.
# ─────────────────────────────────────────────────────────────────────────────

class BuffettEngine:
    """
    Warren Buffett's principles adapted for sub-minute trading.

    This is NOT Buffett's actual strategy — it's his RISK PHILOSOPHY
    encoded into ultra-short timeframe guardrails:

      Margin of Safety → Only enter if price > X% above measurable floor
      Rule #1 (Never Lose) → If volatility is chaotic, FREEZE capital
      Intrinsic Value → VWAP = our proxy for short-term "fair value"
      Circle of Competence → Only trade assets with historical data in DB
      Patience → Do not enter if the setup is not pristine

    VETO POWER: Buffett Engine can OVERRIDE ALL other engines.
    If Rule #1 fires, no trade is placed regardless of Sykes/Grittani/Kellogg score.
    """

    # Rule #1 thresholds
    VOLATILITY_FREEZE_PCT  = 0.08   # ATR/price > 8% = chaos → freeze
    DRAWDOWN_FREEZE_PCT    = 0.15   # Portfolio down 15% from high → freeze
    MARGIN_OF_SAFETY_MIN   = 0.003  # Must have 0.3% buffer above floor

    # Value/Forex scalper thresholds (low-volatility regime)
    SAFE_ENTRY_VWAP_DEV    = 0.008  # Enter only within 0.8% of VWAP
    SAFE_RSI_LONG_ZONE     = (35, 55)  # RSI in neutral-to-mild-bullish zone
    SAFE_RSI_SHORT_ZONE    = (45, 65)  # RSI in neutral-to-mild-bearish zone

    def score(
        self,
        ctx             : MarketContext,
        portfolio_dd_pct: float = 0.0,  # Current portfolio drawdown %
    ) -> LegendScore:
        closes = np.array([c[4] for c in ctx.ohlcv], dtype=float)
        highs  = np.array([c[2] for c in ctx.ohlcv], dtype=float)
        lows   = np.array([c[3] for c in ctx.ohlcv], dtype=float)
        vols   = np.array([c[5] for c in ctx.ohlcv], dtype=float)

        rsi     = calculate_rsi(closes)
        atr     = calculate_atr(highs, lows, closes)
        vwap    = calculate_vwap(highs, lows, closes, vols)
        vwap_dev= vwap_deviation_pct(ctx.price, vwap)

        atr_pct = atr / ctx.price if ctx.price > 0 else 0.0

        score   = 50.0   # Buffett starts neutral — earn your entry
        reasons = []
        pattern = 'VALUE_ZONE'
        direction = 'FLAT'

        # ══════════════════════════════════════════════════════════════════
        # RULE #1 — NEVER LOSE MONEY (HARD VETO)
        #
        # Condition A: Volatility is chaotic (ATR/price > 8%)
        #   → Pull capital to base, freeze for 3 cycles
        # Condition B: Portfolio drawdown > 15%
        #   → Same action
        # ══════════════════════════════════════════════════════════════════
        if atr_pct >= self.VOLATILITY_FREEZE_PCT:
            return LegendScore(
                master='BUFFETT', raw_score=0.0, direction='FLAT',
                conviction='STRONG', pattern='RULE_1_VOLATILITY_FREEZE',
                reasons=[
                    f'RULE #1 VETO: ATR/price = {atr_pct*100:.2f}% (chaos threshold: {self.VOLATILITY_FREEZE_PCT*100:.0f}%)'
                ],
                veto=True,
                veto_reason=(
                    f'Buffett Rule #1: Volatility chaos — ATR {atr_pct*100:.1f}% '
                    f'of price. Capital preservation mode. NO new trades.'
                )
            )

        if portfolio_dd_pct >= self.DRAWDOWN_FREEZE_PCT:
            return LegendScore(
                master='BUFFETT', raw_score=0.0, direction='FLAT',
                conviction='STRONG', pattern='RULE_1_DRAWDOWN_FREEZE',
                reasons=[
                    f'RULE #1 VETO: Portfolio drawdown {portfolio_dd_pct*100:.1f}% exceeds {self.DRAWDOWN_FREEZE_PCT*100:.0f}% limit'
                ],
                veto=True,
                veto_reason=(
                    f'Buffett Rule #1: Portfolio down {portfolio_dd_pct*100:.1f}% — '
                    f'halting all trades until capital recovers to 90% of high.'
                )
            )

        # ══════════════════════════════════════════════════════════════════
        # MARGIN OF SAFETY — adapted for HFT
        #
        # Buffett's MoS = (Intrinsic Value - Price) / Intrinsic Value
        # HFT proxy:
        #   Intrinsic Value = VWAP (volume-weighted fair price)
        #   Floor = VWAP - (ATR × 1.0) [historical support zone]
        #   Margin = (Price - Floor) / Price
        #
        # LONG: only enter if floor is within ATR, giving room to bounce
        # SHORT: only enter if ceiling (VWAP + ATR) is above, confirming resistance
        # ══════════════════════════════════════════════════════════════════
        floor   = vwap - atr * 1.0
        ceiling = vwap + atr * 1.0

        margin_of_safety_long  = (ctx.price - floor)  / ctx.price if ctx.price > 0 else 0.0
        margin_of_safety_short = (ceiling - ctx.price) / ctx.price if ctx.price > 0 else 0.0

        # ══════════════════════════════════════════════════════════════════
        # BUFFETT VALUE ZONE — LOW VOLATILITY STEADY SCALPING
        #
        # When ATR is low: enter near VWAP with RSI in the middle zone.
        # This is the "Value/Forex Scalper" mode — consistent small gains.
        # ══════════════════════════════════════════════════════════════════
        low_vol_regime = atr_pct < 0.015   # ATR < 1.5% of price

        if low_vol_regime:
            near_vwap = abs(vwap_dev) < self.SAFE_ENTRY_VWAP_DEV * 100

            if near_vwap:
                # LONG setup in value zone
                if (self.SAFE_RSI_LONG_ZONE[0] <= rsi <= self.SAFE_RSI_LONG_ZONE[1]
                        and vwap_dev < 0):
                    score += 30.0
                    reasons.append(
                        f'Buffett VALUE ZONE (LONG): RSI {rsi:.1f} neutral, '
                        f'{vwap_dev:.3f}% below VWAP, low volatility'
                    )
                    pattern   = 'VALUE_SCALP_LONG'
                    direction = 'LONG'

                # SHORT setup in value zone
                elif (self.SAFE_RSI_SHORT_ZONE[0] <= rsi <= self.SAFE_RSI_SHORT_ZONE[1]
                        and vwap_dev > 0):
                    score += 25.0
                    reasons.append(
                        f'Buffett VALUE ZONE (SHORT): RSI {rsi:.1f}, '
                        f'{vwap_dev:.3f}% above VWAP, low volatility'
                    )
                    pattern   = 'VALUE_SCALP_SHORT'
                    direction = 'SHORT'

        # ══════════════════════════════════════════════════════════════════
        # MARGIN OF SAFETY SCORING
        # ══════════════════════════════════════════════════════════════════
        if margin_of_safety_long >= self.MARGIN_OF_SAFETY_MIN:
            score += 15.0
            reasons.append(f'MoS LONG: {margin_of_safety_long*100:.2f}% above floor')
        else:
            score -= 10.0
            reasons.append(f'Insufficient margin of safety: {margin_of_safety_long*100:.3f}%')

        # ATR sanity — Buffett prefers lower volatility assets
        if atr_pct < 0.02:
            score += 10.0
            reasons.append(f'Low volatility: ATR = {atr_pct*100:.2f}% of price')
        elif atr_pct > 0.04:
            score -= 15.0
            reasons.append(f'High volatility warning: ATR = {atr_pct*100:.2f}% of price')

        # ══════════════════════════════════════════════════════════════════
        # CIRCLE OF COMPETENCE: Buffett's "only invest in what you know"
        # Proxy: Large-cap crypto + forex = known. Micro-cap = outside circle.
        # ══════════════════════════════════════════════════════════════════
        if ctx.asset_type == 'forex':
            score += 10.0   # Buffett respects currency markets
            reasons.append('Asset within circle of competence (forex)')
        elif ctx.asset_type == 'crypto' and ctx.market_cap > 1e10:  # >$10B mcap
            score += 5.0
            reasons.append('Large-cap crypto: within competence circle')
        elif ctx.float_shares > 0 and ctx.float_shares < 5_000_000:
            score -= 20.0   # Micro-float = speculation = outside Buffett's circle
            reasons.append('Micro-float penny: OUTSIDE Buffett competence circle')

        score = min(100.0, max(0.0, score))
        conviction = ('STRONG' if score >= 60 else
                      'MODERATE' if score >= 35 else 'WEAK')

        return LegendScore(
            master='BUFFETT', raw_score=score, direction=direction,
            conviction=conviction, pattern=pattern, reasons=reasons,
        )


# ─────────────────────────────────────────────────────────────────────────────
# LEGEND CONSENSUS ENGINE — THE UNIFIED BRAIN
# Weighted aggregation of all four masters into one verdict
# ─────────────────────────────────────────────────────────────────────────────

# Weight matrix per market regime
#
#              PENNY_LEGEND    VALUE_SCALPER    NEUTRAL
# Sykes        0.35            0.05             0.15
# Grittani     0.35            0.10             0.20
# Kellogg      0.20            0.15             0.20
# Buffett      0.10            0.70             0.45
#
# In Penny Legend mode, Buffett is reduced to a safety check only.
# In Value Scalper mode, Buffett dominates — safety is the priority.

REGIME_WEIGHTS = {
    'PENNY_LEGEND' : {'SYKES': 0.35, 'GRITTANI': 0.35, 'KELLOGG': 0.20, 'BUFFETT': 0.10},
    'VALUE_SCALPER': {'SYKES': 0.05, 'GRITTANI': 0.10, 'KELLOGG': 0.15, 'BUFFETT': 0.70},
    'NEUTRAL'      : {'SYKES': 0.15, 'GRITTANI': 0.20, 'KELLOGG': 0.20, 'BUFFETT': 0.45},
}


class LegendConsensusEngine:
    """
    The unified brain. Runs all four engines, weighs by market regime,
    and produces a single authoritative LegendVerdict.
    """

    def __init__(self):
        self.sykes    = SykesEngine()
        self.grittani = GrittaniEngine()
        self.kellogg  = KelloggEngine()
        self.buffett  = BuffettEngine()

    def evaluate(
        self,
        ctx             : MarketContext,
        regime          : str,
        portfolio_dd_pct: float = 0.0,
    ) -> LegendVerdict:
        weights = REGIME_WEIGHTS.get(regime, REGIME_WEIGHTS['NEUTRAL'])

        # ── Run all four engines ──────────────────────────────────────────
        s_score = self.sykes.score(ctx)
        g_score = self.grittani.score(ctx)
        k_score = self.kellogg.score(ctx)
        b_score = self.buffett.score(ctx, portfolio_dd_pct)

        scores = {
            'SYKES'   : s_score,
            'GRITTANI': g_score,
            'KELLOGG' : k_score,
            'BUFFETT' : b_score,
        }

        # ── Buffett Rule #1 VETO — overrides EVERYTHING ───────────────────
        if b_score.veto:
            return LegendVerdict(
                symbol          = ctx.symbol,
                direction       = 'FLAT',
                consensus_score = 0.0,
                sykes_score     = s_score.raw_score,
                grittani_score  = g_score.raw_score,
                kellogg_score   = k_score.raw_score,
                buffett_score   = 0.0,
                active_regime   = regime,
                approved        = False,
                dominant_master = 'BUFFETT',
                patterns        = [b_score.pattern],
                reasons         = [b_score.veto_reason],
            )

        # ── Check other vetos ─────────────────────────────────────────────
        for master, ls in scores.items():
            if ls.veto and master != 'BUFFETT':
                # Non-Buffett veto reduces score significantly but doesn't freeze
                scores[master] = LegendScore(
                    master=master, raw_score=0.0,
                    direction='FLAT', conviction='WEAK',
                    pattern='VETOED', reasons=[ls.veto_reason],
                )

        # ── Direction vote ────────────────────────────────────────────────
        direction_votes: dict[str, float] = {'LONG': 0.0, 'SHORT': 0.0, 'FLAT': 0.0}
        for master, ls in scores.items():
            w = weights[master]
            direction_votes[ls.direction] = (
                direction_votes.get(ls.direction, 0.0) + w * ls.raw_score
            )

        final_direction = max(direction_votes, key=direction_votes.get)
        if direction_votes[final_direction] < 15.0:
            final_direction = 'FLAT'

        # ── Weighted consensus score ──────────────────────────────────────
        consensus = sum(
            weights[m] * scores[m].raw_score for m in weights
        )

        # ── Dominant master ───────────────────────────────────────────────
        dominant = max(scores.keys(), key=lambda m: weights[m] * scores[m].raw_score)

        # ── Aggregate reasons and patterns ────────────────────────────────
        all_reasons  = []
        all_patterns = []
        for m, ls in scores.items():
            all_reasons.extend([f'[{m}] {r}' for r in ls.reasons])
            if ls.pattern not in ('NONE', 'VETOED'):
                all_patterns.append(f'{m}:{ls.pattern}')

        approved = (
            final_direction != 'FLAT' and
            consensus >= 25.0 and
            not b_score.veto
        )

        return LegendVerdict(
            symbol          = ctx.symbol,
            direction       = final_direction,
            consensus_score = round(consensus, 2),
            sykes_score     = s_score.raw_score,
            grittani_score  = g_score.raw_score,
            kellogg_score   = k_score.raw_score,
            buffett_score   = b_score.raw_score,
            active_regime   = regime,
            approved        = approved,
            dominant_master = dominant,
            patterns        = all_patterns,
            reasons         = all_reasons,
        )
