"""
HFT Engine — Main Execution Loop
Institutional-grade 8-second polling loop.
  • CCXT (Binance) for crypto OHLCV data
  • Alpaca for paper stock trades
  • Integrates: indicators → signals → risk_manager → session_manager → logger

Run from terminal:  python engine.py
"""

import asyncio
import time
import traceback
from datetime import datetime, timezone
from typing import Optional

import ccxt
import numpy as np

from config import (
    BINANCE_API_KEY, BINANCE_API_SECRET,
    ALPACA_API_KEY, ALPACA_API_SECRET, ALPACA_BASE_URL,
    CRYPTO_PAIRS, FOREX_PAIRS, STOCK_UNIVERSE,
    CANDLE_INTERVAL, CANDLE_LOOKBACK, POLL_INTERVAL_SECONDS,
    MIN_SIGNAL_SCORE, MAX_POSITION_PCT,
    CRYPTO_TP_PCT, CRYPTO_SL_PCT,
    FOREX_TP_PCT, FOREX_SL_PCT,
    STOCK_TP_PCT, STOCK_SL_PCT,
)
from indicators  import generate_signal
from risk_manager import RiskManager
from session_manager import SessionManager
from logger import TradeLogger

try:
    import alpaca_trade_api as tradeapi
    ALPACA_AVAILABLE = True
except ImportError:
    ALPACA_AVAILABLE = False
    print('[WARNING] alpaca-trade-api not installed. Stock trading disabled.')


# ── Constants ─────────────────────────────────────────────────────────────────
MAX_CRYPTO_POSITIONS = 4
MAX_STOCK_POSITIONS  = 3
MAX_FOREX_POSITIONS  = 2
SCAN_INTERVAL_SEC    = POLL_INTERVAL_SECONDS  # 8 seconds

# Per-asset-class trailing stop configs
ASSET_CONFIG = {
    'crypto': {'tp': CRYPTO_TP_PCT, 'sl': CRYPTO_SL_PCT},
    'forex' : {'tp': FOREX_TP_PCT,  'sl': FOREX_SL_PCT},
    'stock' : {'tp': STOCK_TP_PCT,  'sl': STOCK_SL_PCT},
}


# ── Position Store ─────────────────────────────────────────────────────────────
class Position:
    """Represents one open position held by the engine."""

    def __init__(
        self,
        symbol     : str,
        asset_type : str,
        direction  : str,
        entry_price: float,
        shares     : float,
        tp_price   : float,
        sl_price   : float,
        atr        : float,
    ):
        self.symbol      = symbol
        self.asset_type  = asset_type
        self.direction   = direction
        self.entry_price = entry_price
        self.shares      = shares
        self.tp_price    = tp_price
        self.sl_price    = sl_price
        self.atr         = atr
        self.entry_time  = time.time()
        self.current_price: float = entry_price

    def unrealized_pnl(self) -> float:
        if self.direction == 'LONG':
            return (self.current_price - self.entry_price) * self.shares
        else:
            return (self.entry_price - self.current_price) * self.shares

    def hold_seconds(self) -> float:
        return time.time() - self.entry_time


# ── Trading Engine ─────────────────────────────────────────────────────────────
class HFTEngine:

    def __init__(self):
        self.risk    = RiskManager()
        self.session = SessionManager()
        self.logger  = TradeLogger()

        # Open positions: symbol → Position
        self.positions: dict[str, Position] = {}

        # CCXT exchange (Binance)
        self.exchange = ccxt.binance({
            'apiKey'   : BINANCE_API_KEY,
            'secret'   : BINANCE_API_SECRET,
            'options'  : {'defaultType': 'spot'},
            'enableRateLimit': True,
        })

        # Alpaca (paper trading)
        self.alpaca = None
        if ALPACA_AVAILABLE and ALPACA_API_KEY:
            try:
                self.alpaca = tradeapi.REST(
                    ALPACA_API_KEY, ALPACA_API_SECRET, ALPACA_BASE_URL,
                    api_version='v2'
                )
                self.logger.log_session_event(
                    'ALPACA_CONNECTED', self.session.state.mode,
                    self.session.state.available_cash, 0.0, 0, 'Paper trading ready'
                )
            except Exception as e:
                print(f'[WARNING] Alpaca connection failed: {e}')

        self._running = True

    # ── Phase Detection ────────────────────────────────────────────────────────
    def _current_phase(self) -> str:
        """
        CRYPTO_NIGHT : 00:00–08:00 UTC
        PREMARKET    : 08:00–13:30 UTC
        STOCK_MARKET : 13:30–20:00 UTC
        AFTER_HOURS  : 20:00–24:00 UTC
        Weekends     : always CRYPTO_NIGHT
        """
        now = datetime.now(timezone.utc)
        if now.weekday() >= 5:
            return 'CRYPTO_NIGHT'

        hour_min = now.hour * 60 + now.minute
        if hour_min < 480:          # 00:00–08:00
            return 'CRYPTO_NIGHT'
        elif hour_min < 810:        # 08:00–13:30
            return 'PREMARKET'
        elif hour_min < 1200:       # 13:30–20:00
            return 'STOCK_MARKET'
        else:
            return 'AFTER_HOURS'

    def _active_pairs(self, phase: str) -> list[tuple[str, str]]:
        """
        Returns list of (symbol, asset_type) to scan for this phase.
        Crypto runs 24/7. Stocks only during market hours.
        """
        pairs: list[tuple[str, str]] = []

        # Crypto always available
        for p in CRYPTO_PAIRS:
            pairs.append((p, 'crypto'))

        # Forex during extended hours
        if phase in ('PREMARKET', 'AFTER_HOURS', 'CRYPTO_NIGHT'):
            for p in FOREX_PAIRS:
                pairs.append((p, 'forex'))

        # Stocks only during stock hours
        if phase == 'STOCK_MARKET' and self.session.state.mode == 'SESSION_2':
            for s in STOCK_UNIVERSE[:10]:   # Top 10 to keep scan fast
                pairs.append((s, 'stock'))

        return pairs

    # ── Data Fetching ─────────────────────────────────────────────────────────
    def _fetch_ohlcv(self, symbol: str, asset_type: str) -> Optional[list]:
        """
        Fetch candles for crypto/forex via CCXT Binance.
        Stocks use Alpaca historical bars.
        """
        try:
            if asset_type in ('crypto', 'forex'):
                ohlcv = self.exchange.fetch_ohlcv(
                    symbol, CANDLE_INTERVAL, limit=CANDLE_LOOKBACK
                )
                return ohlcv  # [[ts, o, h, l, c, v], ...]

            elif asset_type == 'stock' and self.alpaca:
                bars = self.alpaca.get_bars(
                    symbol.replace('/', ''), '1Min', limit=CANDLE_LOOKBACK
                )
                # Convert Alpaca Bar objects → [[ts, o, h, l, c, v]]
                return [
                    [int(b.t.timestamp() * 1000), b.o, b.h, b.l, b.c, b.v]
                    for b in bars
                ]

        except Exception as e:
            # Rate limit or network — skip silently
            if 'rate limit' in str(e).lower():
                time.sleep(1)
            return None

    def _get_current_price(self, symbol: str, asset_type: str) -> Optional[float]:
        """Quick ticker price for position marking."""
        try:
            if asset_type in ('crypto', 'forex'):
                ticker = self.exchange.fetch_ticker(symbol)
                return float(ticker['last'])
            elif asset_type == 'stock' and self.alpaca:
                quote = self.alpaca.get_last_quote(symbol)
                return float((quote.askprice + quote.bidprice) / 2)
        except Exception:
            return None

    # ── Position Limits ───────────────────────────────────────────────────────
    def _can_open(self, asset_type: str) -> bool:
        open_count = sum(1 for p in self.positions.values() if p.asset_type == asset_type)
        limits = {
            'crypto': MAX_CRYPTO_POSITIONS,
            'forex' : MAX_FOREX_POSITIONS,
            'stock' : MAX_STOCK_POSITIONS,
        }
        return open_count < limits.get(asset_type, 2)

    # ── Trade Execution ───────────────────────────────────────────────────────
    def _open_position(
        self,
        signal    : dict,
        ohlcv     : list,
        asset_type: str,
        cash      : float,
    ):
        symbol    = signal.get('symbol', '?')
        direction = signal['direction']
        price     = signal['price']
        atr       = signal['atr']

        if price <= 0 or atr <= 0:
            return

        # Re-entry guard
        allowed, reason = self.risk.can_reenter(symbol, direction, ohlcv, direction)
        if not allowed:
            return

        # Position sizing
        shares = self.risk.calculate_position_size(cash, price, atr, direction)
        if shares <= 0:
            return

        # Adjusted entry price (slippage + fees baked in)
        exec_price = self.risk.apply_fees_and_slippage(price, 'BUY' if direction == 'LONG' else 'SHORT_OPEN')

        # TP / SL
        tp = self.risk.minimum_tp_price(exec_price, shares, direction, asset_type)
        sl = self.risk.maximum_sl_price(exec_price, atr, direction, asset_type)

        # Create position
        pos = Position(symbol, asset_type, direction, exec_price, shares, tp, sl, atr)
        self.positions[symbol] = pos

        self.logger.log_entry(symbol, direction, exec_price, shares, tp, sl, self.session.state.mode)

    def _close_position(self, symbol: str, exit_price: float, reason: str):
        pos = self.positions.pop(symbol, None)
        if pos is None:
            return

        # Adjusted exit price
        exec_exit = self.risk.apply_fees_and_slippage(
            exit_price,
            'SELL' if pos.direction == 'LONG' else 'SHORT_COVER'
        )

        net = self.risk.net_pnl(pos.entry_price, exec_exit, pos.shares, pos.direction)
        gross = (exec_exit - pos.entry_price) * pos.shares if pos.direction == 'LONG' \
            else (pos.entry_price - exec_exit) * pos.shares

        # Record in risk manager and session
        self.risk.update_pnl(net)
        self.risk.record_stop_out(symbol, pos.direction) if net < 0 else None
        self.session.record_trade(net, pos.asset_type)

        self.logger.log_trade(
            symbol, pos.asset_type, pos.direction,
            pos.entry_price, exec_exit, pos.shares,
            gross, net, reason,
            self.session.state.mode,
            pos.entry_time,
        )

    # ── Exit Logic ────────────────────────────────────────────────────────────
    def _check_exits(self):
        """
        Check all open positions against TP/SL/trailing stop/time rules.
        Mutates self.positions.
        """
        to_close: list[tuple[str, float, str]] = []

        for symbol, pos in list(self.positions.items()):
            current = pos.current_price
            if current <= 0:
                continue

            reason = None

            if pos.direction == 'LONG':
                # Update trailing stop (ratchet up)
                from indicators import update_trailing_stop
                pos.sl_price = update_trailing_stop(pos.sl_price, current, pos.atr, 'LONG')

                if current >= pos.tp_price:
                    reason = 'TP_HIT'
                elif current <= pos.sl_price:
                    reason = 'SL_HIT'

            else:  # SHORT
                from indicators import update_trailing_stop
                pos.sl_price = update_trailing_stop(pos.sl_price, current, pos.atr, 'SHORT')

                if current <= pos.tp_price:
                    reason = 'TP_HIT'
                elif current >= pos.sl_price:
                    reason = 'SL_HIT'

            # Time-based exit: close any position with profit after 90 sec
            if reason is None and pos.hold_seconds() > 90:
                pnl = pos.unrealized_pnl()
                if pnl > 0:
                    reason = 'TIME_TP'
                elif pos.hold_seconds() > 300:
                    reason = 'TIME_STALE'   # Force-close stale positions

            if reason:
                to_close.append((symbol, current, reason))

        for symbol, price, reason in to_close:
            self._close_position(symbol, price, reason)

    # ── Main Scan Cycle ───────────────────────────────────────────────────────
    async def _scan_cycle(self):
        phase = self._current_phase()
        pairs = self._active_pairs(phase)

        # Update bar counter and check drawdown
        self.risk.increment_bar()

        # Print status header every 5 bars
        if self.risk.bar_counter % 5 == 0:
            self.logger.print_status_header(
                cash          = self.session.state.available_cash,
                session_mode  = self.session.state.mode,
                open_positions= len(self.positions),
                bar_counter   = self.risk.bar_counter,
                phase         = phase,
                halt_status   = self.risk.get_status(),
            )

        # Circuit breaker check
        if self.risk.check_drawdown_breach():
            self.logger.log_halt(self.risk.halt_reason)
            return

        # Update current prices on open positions
        for symbol, pos in self.positions.items():
            price = self._get_current_price(symbol, pos.asset_type)
            if price:
                pos.current_price = price

        # Exit checks FIRST (before looking for new entries)
        self._check_exits()

        # Session promotion check
        if self.session.check_session_promotion():
            status = self.session.get_status()
            self.logger.log_session_event(
                'SESSION_2_UNLOCKED',
                'SESSION_2',
                status['available_cash'],
                status['total_profit'],
                status['total_trades'],
                f'Seed locked. ${status["stock_capital"]:.2f} → stocks, '
                f'${status["crypto_capital"]:.2f} → crypto/forex'
            )

        # Signal scan — look for new entries
        signals = []

        for symbol, asset_type in pairs:
            # Check position limit per asset type
            if symbol in self.positions:
                continue  # Already holding
            if not self._can_open(asset_type):
                continue

            # Fetch candles
            ohlcv = self._fetch_ohlcv(symbol, asset_type)
            if not ohlcv or len(ohlcv) < 20:
                continue

            sig = generate_signal(ohlcv)
            sig['symbol']     = symbol
            sig['asset_type'] = asset_type
            sig['ohlcv']      = ohlcv

            if sig['direction'] != 'NEUTRAL' and abs(sig['score']) >= MIN_SIGNAL_SCORE:
                signals.append(sig)
                self.logger.log_signal(symbol, sig['direction'], sig['score'], sig['reasons'])

            # Small sleep to respect rate limits
            await asyncio.sleep(0.05)

        # Sort: highest absolute score first
        signals.sort(key=lambda s: abs(s['score']), reverse=True)

        # Execute best signals
        for sig in signals:
            asset_type = sig['asset_type']
            if not self._can_open(asset_type):
                continue

            # Check session capital allocation
            cash = self.session.get_tradeable_cash(asset_type)
            if cash < 5.0:  # Need at least $5
                continue

            self._open_position(sig, sig['ohlcv'], asset_type, cash)

    # ── Daily Reset ───────────────────────────────────────────────────────────
    def _midnight_reset(self):
        """Called when date changes — resets daily risk counters."""
        self.logger.log_session_event(
            'DAILY_RESET',
            self.session.state.mode,
            self.session.state.available_cash,
            self.session.current_profit(),
            self.session.state.total_trades,
            'New trading day'
        )
        self.risk.reset_daily()
        self.session.daily_reset(self.risk.current_pnl)

    # ── Entry Point ───────────────────────────────────────────────────────────
    async def run(self):
        """Main loop — runs until keyboard interrupt or fatal error."""
        last_date = datetime.now().date()

        print(f"\n{'═'*60}")
        print(f"  JALAYU HFT ENGINE STARTING")
        print(f"  Mode    : {self.session.state.mode}")
        print(f"  Capital : ${self.session.state.available_cash:.2f}")
        print(f"  Target  : +$50 profit → Session 2")
        print(f"  Interval: {SCAN_INTERVAL_SEC}s scan cycle")
        print(f"{'═'*60}\n")

        while self._running:
            cycle_start = time.time()

            try:
                # Midnight reset
                today = datetime.now().date()
                if today != last_date:
                    self._midnight_reset()
                    last_date = today

                await self._scan_cycle()

            except KeyboardInterrupt:
                self._running = False
                break
            except Exception as e:
                print(f'  [ERROR] Scan cycle failed: {e}')
                traceback.print_exc()

            # Sleep the remainder of the scan interval
            elapsed = time.time() - cycle_start
            sleep_for = max(0.1, SCAN_INTERVAL_SEC - elapsed)
            await asyncio.sleep(sleep_for)

        # Graceful shutdown
        self.logger.print_full_summary(
            self.session.get_status(),
            self.risk.get_status(),
            [
                {
                    'symbol'       : s,
                    'direction'    : p.direction,
                    'entry_price'  : p.entry_price,
                    'current_price': p.current_price,
                    'shares'       : p.shares,
                }
                for s, p in self.positions.items()
            ]
        )
        print("  Engine stopped. Logs saved to ./logs/")


# ── CLI ────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    engine = HFTEngine()
    try:
        asyncio.run(engine.run())
    except KeyboardInterrupt:
        print('\n  Shutdown requested by user.')
