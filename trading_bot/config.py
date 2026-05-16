"""
HFT Engine Configuration
All constants, API keys, and strategy parameters.
"""

# ── API Keys (set via .env or environment variables) ──────────────────────────
import os
from dotenv import load_dotenv
load_dotenv()

# Binance (crypto) — public endpoints need no key; private trading needs keys
BINANCE_API_KEY    = os.getenv('BINANCE_API_KEY', '')
BINANCE_API_SECRET = os.getenv('BINANCE_API_SECRET', '')

# Alpaca (US stocks paper trading) — free at alpaca.markets
ALPACA_API_KEY    = os.getenv('ALPACA_API_KEY', '')
ALPACA_API_SECRET = os.getenv('ALPACA_API_SECRET', '')
ALPACA_BASE_URL   = 'https://paper-api.alpaca.markets'  # Paper trading endpoint

# ── Capital Configuration ─────────────────────────────────────────────────────
SEED_CAPITAL          = 100.0   # Starting capital ($100)
SESSION1_PROFIT_TARGET = 50.0   # Hit $50 profit → unlock Session 2
SESSION2_STOCK_ALLOC  = 0.90    # 90% of profits go to stocks in Session 2

# ── Execution Timing ──────────────────────────────────────────────────────────
POLL_INTERVAL_SECONDS = 8       # Scan every 8 seconds
CANDLE_INTERVAL       = '1m'    # 1-minute candles for RSI/ATR/VWAP
CANDLE_LOOKBACK       = 50      # Number of candles to fetch

# ── Indicator Parameters ──────────────────────────────────────────────────────
RSI_PERIOD    = 14
ATR_PERIOD    = 14
VWAP_PERIODS  = 20   # Rolling VWAP window (candles)
EMA_FAST      = 9
EMA_SLOW      = 21

# ── Signal Thresholds ─────────────────────────────────────────────────────────
RSI_OVERSOLD      = 32    # Below = strong long signal
RSI_OVERBOUGHT    = 68    # Above = strong short signal
VWAP_DEV_LONG     = -0.8  # Price X% below VWAP = buy pressure
VWAP_DEV_SHORT    = +0.8  # Price X% above VWAP = sell pressure
OBI_BUY_THRESHOLD = 0.25  # Order book imbalance: buy dominance
OBI_SELL_THRESHOLD= -0.25 # Order book imbalance: sell dominance
MIN_SIGNAL_SCORE  = 3.0   # Minimum combined score to enter a trade

# ── Risk Parameters ───────────────────────────────────────────────────────────
RISK_PER_TRADE_PCT    = 0.01   # Risk 1% of capital per trade
ATR_TRAILING_MULT     = 2.0    # Trailing stop = 2x ATR from entry
MAX_POSITION_PCT      = 0.20   # Max 20% of capital per single position
MAX_DAILY_DRAWDOWN_PCT= 0.20   # Halt if portfolio drops 20% from daily high
REENTRY_COOLDOWN_BARS = 3      # Wait 3 candles before re-entering after stop-out

# ── Take Profit / Stop Loss ───────────────────────────────────────────────────
# Paper trading simulated fees (Binance: 0.1% maker, 0.1% taker)
SIMULATED_FEE_PCT = 0.001      # 0.1% per leg = 0.2% round trip
SLIPPAGE_PCT      = 0.0005     # 0.05% slippage simulation

# Take profit must cover fees + min $0.50 absolute on a per-unit basis
# For crypto: use percentage
CRYPTO_TP_PCT     = 0.0025     # +0.25% TP (covers 0.2% fees + 0.05% slippage)
CRYPTO_SL_PCT     = 0.0015     # -0.15% SL (tight stop, high win rate)
FOREX_TP_PCT      = 0.0015     # +0.15% TP (forex moves slower)
FOREX_SL_PCT      = 0.0008     # -0.08% SL
STOCK_TP_PCT      = 0.003      # +0.3% TP for stocks
STOCK_SL_PCT      = 0.002      # -0.2% SL for stocks

# Minimum absolute profit per trade ($0.50 after fees)
MIN_ABSOLUTE_PROFIT = 0.50

# ── Asset Universe ────────────────────────────────────────────────────────────
CRYPTO_PAIRS = [
    'BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT',
    'XRP/USDT', 'ADA/USDT', 'AVAX/USDT', 'DOGE/USDT',
    'LINK/USDT', 'DOT/USDT', 'MATIC/USDT', 'LTC/USDT',
]

FOREX_PAIRS = [
    'EUR/USDT', 'GBP/USDT',  # Not available on Binance, handled via forex API
]

# US Stocks — volatile momentum plays (used in Session 2)
STOCK_UNIVERSE = [
    # Mega-cap momentum
    'NVDA', 'TSLA', 'AAPL', 'MSFT', 'AMZN', 'META',
    # High-volatility small/mid cap
    'GME', 'AMC', 'SPCE', 'BBAI', 'MULN', 'FFIE',
    'CLOV', 'MVIS', 'KOSS', 'NKLA', 'RIDE',
]

# ── Logging ───────────────────────────────────────────────────────────────────
LOG_DIR      = './logs'
LOG_TO_CSV   = True
LOG_TO_CONSOLE = True
