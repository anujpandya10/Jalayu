"""
HFT Quantitative Indicators
Exact mathematical implementations of RSI, ATR, VWAP, OBI, EMA.
All functions are vectorized with NumPy for maximum speed.
"""

import numpy as np
from typing import Optional, Tuple
from config import RSI_PERIOD, ATR_PERIOD, VWAP_PERIODS, EMA_FAST, EMA_SLOW


# ── RSI — Relative Strength Index ─────────────────────────────────────────────
def calculate_rsi(closes: np.ndarray, period: int = RSI_PERIOD) -> float:
    """
    Wilder's RSI using exponential smoothing (the correct implementation).
    Formula: RSI = 100 - (100 / (1 + RS))
    where RS = Avg Gain / Avg Loss over `period` bars
    """
    if len(closes) < period + 1:
        return 50.0  # Neutral if insufficient data

    deltas = np.diff(closes)
    gains  = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # Initial averages (simple average for seed)
    avg_gain = np.mean(gains[:period])
    avg_loss = np.mean(losses[:period])

    # Wilder smoothing for remaining bars
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

    if avg_loss == 0:
        return 100.0

    rs  = avg_gain / avg_loss
    rsi = 100.0 - (100.0 / (1.0 + rs))
    return float(round(rsi, 2))


def rsi_divergence(closes: np.ndarray, period: int = RSI_PERIOD) -> str:
    """
    Detect RSI divergence — price makes new high/low but RSI doesn't.
    Returns: 'bullish', 'bearish', or 'none'
    """
    if len(closes) < period * 2:
        return 'none'

    mid   = len(closes) // 2
    rsi_a = calculate_rsi(closes[:mid], period)
    rsi_b = calculate_rsi(closes[mid:], period)

    price_a = closes[mid - 1]
    price_b = closes[-1]

    # Bearish divergence: price higher, RSI lower → momentum weakening → SHORT signal
    if price_b > price_a and rsi_b < rsi_a - 5:
        return 'bearish'

    # Bullish divergence: price lower, RSI higher → momentum building → LONG signal
    if price_b < price_a and rsi_b > rsi_a + 5:
        return 'bullish'

    return 'none'


# ── ATR — Average True Range ───────────────────────────────────────────────────
def calculate_atr(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    period: int = ATR_PERIOD
) -> float:
    """
    True Range = max of:
      1) High - Low
      2) |High - Previous Close|
      3) |Low  - Previous Close|
    ATR = Wilder EMA of True Range over `period` bars
    """
    if len(closes) < period + 1:
        return float(np.mean(highs - lows))  # Fallback

    prev_closes = closes[:-1]
    h = highs[1:]
    l = lows[1:]

    tr1 = h - l
    tr2 = np.abs(h - prev_closes)
    tr3 = np.abs(l - prev_closes)
    true_range = np.maximum(tr1, np.maximum(tr2, tr3))

    # Wilder smoothing
    atr = np.mean(true_range[:period])
    for i in range(period, len(true_range)):
        atr = (atr * (period - 1) + true_range[i]) / period

    return float(round(atr, 6))


def trailing_stop(
    entry_price: float,
    atr: float,
    direction: str,
    multiplier: float = 2.0
) -> float:
    """
    ATR-based trailing stop.
    LONG:  stop = entry - (ATR × multiplier)
    SHORT: stop = entry + (ATR × multiplier)
    """
    offset = atr * multiplier
    if direction == 'LONG':
        return round(entry_price - offset, 6)
    else:  # SHORT
        return round(entry_price + offset, 6)


def update_trailing_stop(
    current_stop: float,
    current_price: float,
    atr: float,
    direction: str,
    multiplier: float = 2.0
) -> float:
    """
    Ratchet trailing stop — only moves in the direction of profit.
    LONG:  new stop = max(current_stop, price - ATR*mult)
    SHORT: new stop = min(current_stop, price + ATR*mult)
    """
    new_stop = trailing_stop(current_price, atr, direction, multiplier)
    if direction == 'LONG':
        return max(current_stop, new_stop)
    else:
        return min(current_stop, new_stop)


# ── VWAP — Volume Weighted Average Price ──────────────────────────────────────
def calculate_vwap(
    highs: np.ndarray,
    lows: np.ndarray,
    closes: np.ndarray,
    volumes: np.ndarray,
    periods: int = VWAP_PERIODS
) -> float:
    """
    Rolling VWAP over last `periods` candles.
    Typical Price = (High + Low + Close) / 3
    VWAP = Σ(TP × Volume) / Σ(Volume)
    """
    if len(closes) == 0 or np.sum(volumes[-periods:]) == 0:
        return float(closes[-1]) if len(closes) > 0 else 0.0

    tp  = (highs[-periods:] + lows[-periods:] + closes[-periods:]) / 3.0
    vol = volumes[-periods:]

    vwap = np.sum(tp * vol) / np.sum(vol)
    return float(round(vwap, 6))


def vwap_deviation_pct(price: float, vwap: float) -> float:
    """Returns how many percent the price is above (+) or below (-) VWAP."""
    if vwap == 0:
        return 0.0
    return round((price - vwap) / vwap * 100, 4)


# ── EMA — Exponential Moving Average ──────────────────────────────────────────
def calculate_ema(data: np.ndarray, period: int) -> float:
    """Fast EMA using the standard multiplier: k = 2/(period+1)."""
    if len(data) < period:
        return float(np.mean(data))
    k   = 2.0 / (period + 1)
    ema = float(np.mean(data[:period]))  # Seed with SMA
    for price in data[period:]:
        ema = price * k + ema * (1 - k)
    return round(ema, 6)


def ema_crossover(closes: np.ndarray, fast: int = EMA_FAST, slow: int = EMA_SLOW) -> str:
    """
    Returns 'bullish' if fast EMA recently crossed above slow EMA,
    'bearish' if fast crossed below, else 'none'.
    """
    if len(closes) < slow + 2:
        return 'none'

    ema_fast_now  = calculate_ema(closes, fast)
    ema_slow_now  = calculate_ema(closes, slow)
    ema_fast_prev = calculate_ema(closes[:-1], fast)
    ema_slow_prev = calculate_ema(closes[:-1], slow)

    if ema_fast_prev <= ema_slow_prev and ema_fast_now > ema_slow_now:
        return 'bullish'
    if ema_fast_prev >= ema_slow_prev and ema_fast_now < ema_slow_now:
        return 'bearish'
    return 'none'


# ── OBI — Order Book Imbalance ────────────────────────────────────────────────
def calculate_obi_from_book(bids: list, asks: list, depth: int = 10) -> float:
    """
    True OBI from Level 2 order book.
    OBI = (Bid Volume - Ask Volume) / (Bid Volume + Ask Volume)
    Range: -1 (all asks = bearish) to +1 (all bids = bullish)

    Args:
        bids: [[price, volume], ...] sorted descending
        asks: [[price, volume], ...] sorted ascending
        depth: number of levels to use
    """
    bid_vol = sum(b[1] for b in bids[:depth])
    ask_vol = sum(a[1] for a in asks[:depth])
    total   = bid_vol + ask_vol
    if total == 0:
        return 0.0
    return round((bid_vol - ask_vol) / total, 4)


def simulate_obi_from_candles(
    closes: np.ndarray,
    volumes: np.ndarray,
    window: int = 5
) -> float:
    """
    Proxy OBI when order book data is unavailable.
    Uses volume-weighted close direction over recent candles.
    Up-candles = buy pressure, down-candles = sell pressure.
    """
    if len(closes) < window + 1:
        return 0.0

    recent_closes  = closes[-window - 1:]
    recent_volumes = volumes[-window:]

    directions = np.sign(np.diff(recent_closes[-window:]))
    vol_weighted = directions * recent_volumes

    total_vol = np.sum(recent_volumes)
    if total_vol == 0:
        return 0.0

    obi = np.sum(vol_weighted) / total_vol
    return round(float(obi), 4)


# ── Composite Signal Score ─────────────────────────────────────────────────────
def generate_signal(ohlcv: list, order_book: Optional[dict] = None) -> dict:
    """
    Composite signal combining RSI, VWAP, ATR, OBI, EMA crossover,
    and RSI divergence. Returns a scored signal dict.

    Args:
        ohlcv: list of [timestamp, open, high, low, close, volume]
        order_book: {'bids': [...], 'asks': [...]} or None

    Returns:
        {
          'direction': 'LONG' | 'SHORT' | 'NEUTRAL',
          'score': float,  # -10 to +10
          'rsi': float,
          'atr': float,
          'vwap': float,
          'vwap_dev': float,
          'obi': float,
          'ema_signal': str,
          'rsi_div': str,
          'price': float,
          'reasons': list[str],
        }
    """
    if len(ohlcv) < 20:
        return {'direction': 'NEUTRAL', 'score': 0, 'price': ohlcv[-1][4] if ohlcv else 0,
                'reasons': ['Insufficient data']}

    opens   = np.array([c[1] for c in ohlcv], dtype=float)
    highs   = np.array([c[2] for c in ohlcv], dtype=float)
    lows    = np.array([c[3] for c in ohlcv], dtype=float)
    closes  = np.array([c[4] for c in ohlcv], dtype=float)
    volumes = np.array([c[5] for c in ohlcv], dtype=float)

    price   = float(closes[-1])
    rsi     = calculate_rsi(closes)
    atr     = calculate_atr(highs, lows, closes)
    vwap    = calculate_vwap(highs, lows, closes, volumes)
    vwap_dev = vwap_deviation_pct(price, vwap)
    ema_sig = ema_crossover(closes)
    rsi_div = rsi_divergence(closes)

    # OBI
    if order_book and 'bids' in order_book and 'asks' in order_book:
        obi = calculate_obi_from_book(order_book['bids'], order_book['asks'])
    else:
        obi = simulate_obi_from_candles(closes, volumes)

    score   = 0.0
    reasons = []

    # ── RSI scoring ────────────────────────────────────────────────────────────
    if rsi < 25:
        score += 4.5; reasons.append(f'RSI {rsi:.1f} (extreme oversold)')
    elif rsi < 32:
        score += 3.0; reasons.append(f'RSI {rsi:.1f} (oversold)')
    elif rsi < 40:
        score += 1.5; reasons.append(f'RSI {rsi:.1f} (approaching oversold)')
    elif rsi > 75:
        score -= 4.5; reasons.append(f'RSI {rsi:.1f} (extreme overbought)')
    elif rsi > 68:
        score -= 3.0; reasons.append(f'RSI {rsi:.1f} (overbought)')
    elif rsi > 60:
        score -= 1.5; reasons.append(f'RSI {rsi:.1f} (approaching overbought)')

    # ── VWAP deviation scoring ─────────────────────────────────────────────────
    if vwap_dev < -2.0:
        score += 3.5; reasons.append(f'Price {vwap_dev:.2f}% below VWAP (deep discount)')
    elif vwap_dev < -0.8:
        score += 2.0; reasons.append(f'Price {vwap_dev:.2f}% below VWAP')
    elif vwap_dev < -0.3:
        score += 0.8
    elif vwap_dev > 2.0:
        score -= 3.5; reasons.append(f'Price {vwap_dev:.2f}% above VWAP (extended)')
    elif vwap_dev > 0.8:
        score -= 2.0; reasons.append(f'Price {vwap_dev:.2f}% above VWAP')
    elif vwap_dev > 0.3:
        score -= 0.8

    # ── OBI scoring ────────────────────────────────────────────────────────────
    if obi > 0.35:
        score += 2.0; reasons.append(f'OBI +{obi:.2f} (bid dominance)')
    elif obi > 0.15:
        score += 0.8
    elif obi < -0.35:
        score -= 2.0; reasons.append(f'OBI {obi:.2f} (ask dominance)')
    elif obi < -0.15:
        score -= 0.8

    # ── EMA crossover scoring ──────────────────────────────────────────────────
    if ema_sig == 'bullish':
        score += 1.5; reasons.append(f'EMA{EMA_FAST} crossed above EMA{EMA_SLOW}')
    elif ema_sig == 'bearish':
        score -= 1.5; reasons.append(f'EMA{EMA_FAST} crossed below EMA{EMA_SLOW}')

    # ── RSI divergence scoring ─────────────────────────────────────────────────
    if rsi_div == 'bullish':
        score += 2.0; reasons.append('Bullish RSI divergence (price lower, RSI higher)')
    elif rsi_div == 'bearish':
        score -= 2.0; reasons.append('Bearish RSI divergence (price higher, RSI lower)')

    # Clamp to [-10, +10]
    score = max(-10.0, min(10.0, float(score)))

    # Direction determination
    if score >= 3.0:
        direction = 'LONG'
    elif score <= -3.0:
        direction = 'SHORT'
    else:
        direction = 'NEUTRAL'

    return {
        'direction': direction,
        'score': round(score, 2),
        'rsi': rsi,
        'atr': atr,
        'vwap': round(vwap, 6),
        'vwap_dev': vwap_dev,
        'obi': obi,
        'ema_signal': ema_sig,
        'rsi_div': rsi_div,
        'price': price,
        'reasons': reasons,
    }
