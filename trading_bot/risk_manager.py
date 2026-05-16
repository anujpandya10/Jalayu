"""
HFT Risk Manager
Handles position sizing, drawdown circuit breaker, re-entry confirmation,
and fee/slippage-adjusted profitability calculation.
"""

import time
import numpy as np
from typing import Optional
from config import (
    RISK_PER_TRADE_PCT, ATR_TRAILING_MULT, MAX_POSITION_PCT,
    MAX_DAILY_DRAWDOWN_PCT, REENTRY_COOLDOWN_BARS,
    SIMULATED_FEE_PCT, SLIPPAGE_PCT,
    CRYPTO_TP_PCT, CRYPTO_SL_PCT,
    FOREX_TP_PCT, FOREX_SL_PCT,
    STOCK_TP_PCT, STOCK_SL_PCT,
    MIN_ABSOLUTE_PROFIT,
)
from indicators import calculate_rsi, calculate_atr, vwap_deviation_pct, calculate_vwap


class RiskManager:
    """
    Central risk controller for the HFT engine.
    Tracks daily P&L, enforces circuit breakers, manages re-entry cooldowns.
    """

    def __init__(self):
        self.daily_high_pnl      : float = 0.0
        self.current_pnl         : float = 0.0
        self.trading_halted      : bool  = False
        self.halt_reason         : str   = ''
        self.stop_out_log        : dict  = {}   # symbol → {'count': int, 'last_bar': int, 'direction': str}
        self.bar_counter         : int   = 0    # increments each scan cycle
        self.day_reset_timestamp : float = time.time()

    # ── Position Sizing ───────────────────────────────────────────────────────
    def calculate_position_size(
        self,
        cash: float,
        price: float,
        atr: float,
        direction: str = 'LONG',
    ) -> float:
        """
        ATR-based position sizing using 1% risk per trade.

        Risk Amount = Capital × RISK_PER_TRADE_PCT
        Stop Distance = ATR × ATR_TRAILING_MULT
        Shares = Risk Amount / Stop Distance

        Capped at MAX_POSITION_PCT of capital.
        """
        if price <= 0 or atr <= 0:
            return 0.0

        risk_amount    = cash * RISK_PER_TRADE_PCT
        stop_distance  = atr * ATR_TRAILING_MULT
        shares_by_risk = risk_amount / stop_distance

        max_value      = cash * MAX_POSITION_PCT
        shares_by_cap  = max_value / price

        shares = min(shares_by_risk, shares_by_cap)
        return max(0.0, round(shares, 8))

    # ── Fee + Slippage Adjustment ─────────────────────────────────────────────
    def apply_fees_and_slippage(self, price: float, direction: str) -> float:
        """
        Adjust execution price for slippage and taker fees.
        BUY (LONG open / SHORT cover): price is slightly higher
        SELL (LONG close / SHORT open): price is slightly lower
        """
        if direction in ('BUY', 'LONG_OPEN', 'SHORT_COVER'):
            return price * (1 + SLIPPAGE_PCT + SIMULATED_FEE_PCT)
        else:  # SELL, LONG_CLOSE, SHORT_OPEN
            return price * (1 - SLIPPAGE_PCT - SIMULATED_FEE_PCT)

    def net_pnl(
        self,
        entry_price: float,
        exit_price: float,
        shares: float,
        direction: str,
    ) -> float:
        """
        Calculate net P&L after fees and slippage.
        LONG:  profit = (exit - entry) × shares - fees
        SHORT: profit = (entry - exit) × shares - fees
        """
        fee_cost = (entry_price + exit_price) * shares * (SIMULATED_FEE_PCT + SLIPPAGE_PCT)

        if direction == 'LONG':
            gross_pnl = (exit_price - entry_price) * shares
        else:
            gross_pnl = (entry_price - exit_price) * shares

        return round(gross_pnl - fee_cost, 4)

    def minimum_tp_price(self, entry_price: float, shares: float, direction: str, asset_type: str) -> float:
        """
        Calculate the minimum exit price that yields:
          1) ≥ MIN_ABSOLUTE_PROFIT after fees
          2) ≥ asset-class TP% threshold

        Returns the higher of the two as the take-profit trigger price.
        """
        # Percentage-based TP
        pct_map = {'crypto': CRYPTO_TP_PCT, 'forex': FOREX_TP_PCT, 'stock': STOCK_TP_PCT}
        tp_pct  = pct_map.get(asset_type, CRYPTO_TP_PCT)

        if direction == 'LONG':
            pct_tp_price = entry_price * (1 + tp_pct)
        else:
            pct_tp_price = entry_price * (1 - tp_pct)

        # Absolute $0.50 minimum (fee-adjusted)
        fee_per_share = entry_price * (SIMULATED_FEE_PCT + SLIPPAGE_PCT) * 2  # both legs
        min_profit_per_share = (MIN_ABSOLUTE_PROFIT / shares) + fee_per_share

        if direction == 'LONG':
            abs_tp_price = entry_price + min_profit_per_share
            return max(pct_tp_price, abs_tp_price)
        else:
            abs_tp_price = entry_price - min_profit_per_share
            return min(pct_tp_price, abs_tp_price)

    def maximum_sl_price(self, entry_price: float, atr: float, direction: str, asset_type: str) -> float:
        """ATR-trailing initial stop loss price."""
        pct_map = {'crypto': CRYPTO_SL_PCT, 'forex': FOREX_SL_PCT, 'stock': STOCK_SL_PCT}
        sl_pct  = pct_map.get(asset_type, CRYPTO_SL_PCT)

        # Use tighter of ATR-based stop and percentage stop
        atr_stop_dist = atr * ATR_TRAILING_MULT
        pct_stop_dist = entry_price * sl_pct

        stop_dist = min(atr_stop_dist, pct_stop_dist)

        if direction == 'LONG':
            return round(entry_price - stop_dist, 8)
        else:
            return round(entry_price + stop_dist, 8)

    # ── Drawdown Circuit Breaker ──────────────────────────────────────────────
    def update_pnl(self, pnl_delta: float):
        """Call after every trade to track running P&L and check drawdown."""
        self.current_pnl += pnl_delta
        if self.current_pnl > self.daily_high_pnl:
            self.daily_high_pnl = self.current_pnl

    def check_drawdown_breach(self) -> bool:
        """
        Returns True (and halts trading) if current P&L has dropped
        more than MAX_DAILY_DRAWDOWN_PCT from the daily high.
        """
        if self.trading_halted:
            return True

        if self.daily_high_pnl <= 0:
            return False  # Haven't made any profit today yet

        drawdown = (self.daily_high_pnl - self.current_pnl) / self.daily_high_pnl

        if drawdown >= MAX_DAILY_DRAWDOWN_PCT:
            self.trading_halted = True
            self.halt_reason = (
                f'MAX DRAWDOWN BREACH: P&L fell {drawdown*100:.1f}% from '
                f'daily high ${self.daily_high_pnl:.2f} to ${self.current_pnl:.2f}'
            )
            return True

        return False

    def reset_daily(self):
        """Call at midnight to reset daily tracking."""
        self.daily_high_pnl = max(0.0, self.current_pnl)  # Carry forward if profitable
        self.trading_halted = False
        self.halt_reason    = ''
        self.day_reset_timestamp = time.time()

    # ── Re-Entry Confirmation (Anti Revenge Trading) ──────────────────────────
    def record_stop_out(self, symbol: str, direction: str):
        """Record when a position is stopped out. Prevents immediate re-entry."""
        self.stop_out_log[symbol] = {
            'bar': self.bar_counter,
            'direction': direction,
            'count': self.stop_out_log.get(symbol, {}).get('count', 0) + 1,
        }

    def can_reenter(
        self,
        symbol: str,
        direction: str,
        ohlcv: list,
        proposed_direction: str,
    ) -> tuple[bool, str]:
        """
        Confirm whether re-entry is valid after a stop-out.
        Returns (allowed: bool, reason: str)

        Rules:
        1. Must wait REENTRY_COOLDOWN_BARS since last stop-out
        2. Must show structural reversal confirmation:
           - For LONG re-entry after stop: RSI must have come back above 35
           - For SHORT re-entry after stop: RSI must be back below 65
           - VWAP must confirm direction
        3. Counter-direction re-entry is always fine (flipping bias = valid signal)
        """
        record = self.stop_out_log.get(symbol)

        if record is None:
            return True, 'No prior stop-out'

        bars_elapsed = self.bar_counter - record['bar']

        # Same direction as the stop-out = need confirmation
        if record['direction'] == proposed_direction:
            if bars_elapsed < REENTRY_COOLDOWN_BARS:
                return False, f'Cooldown: {REENTRY_COOLDOWN_BARS - bars_elapsed} bars remaining'

            # Structural confirmation
            if len(ohlcv) >= 15:
                closes = np.array([c[4] for c in ohlcv], dtype=float)
                highs  = np.array([c[2] for c in ohlcv], dtype=float)
                lows   = np.array([c[3] for c in ohlcv], dtype=float)
                vols   = np.array([c[5] for c in ohlcv], dtype=float)
                rsi    = calculate_rsi(closes)
                vwap   = calculate_vwap(highs, lows, closes, vols)
                vwap_dev = vwap_deviation_pct(closes[-1], vwap)

                if proposed_direction == 'LONG':
                    if rsi < 35:
                        return False, f'No reversal confirmation: RSI {rsi:.1f} still bearish'
                    if vwap_dev < -1.0:
                        return False, f'Price still {vwap_dev:.2f}% below VWAP'
                    return True, f'Reversal confirmed: RSI {rsi:.1f}, VWAP dev {vwap_dev:.2f}%'

                else:  # SHORT
                    if rsi > 65:
                        return False, f'No reversal confirmation: RSI {rsi:.1f} still bullish'
                    if vwap_dev > 1.0:
                        return False, f'Price still {vwap_dev:.2f}% above VWAP'
                    return True, f'Reversal confirmed: RSI {rsi:.1f}, VWAP dev {vwap_dev:.2f}%'

        # Counter-direction = always allowed (we're flipping bias)
        return True, 'Counter-direction re-entry allowed'

    def increment_bar(self):
        """Call once per scan cycle."""
        self.bar_counter += 1

    # ── Summary ───────────────────────────────────────────────────────────────
    def get_status(self) -> dict:
        drawdown_from_high = 0.0
        if self.daily_high_pnl > 0:
            drawdown_from_high = (self.daily_high_pnl - self.current_pnl) / self.daily_high_pnl

        return {
            'current_pnl'      : round(self.current_pnl, 2),
            'daily_high_pnl'   : round(self.daily_high_pnl, 2),
            'drawdown_pct'     : round(drawdown_from_high * 100, 2),
            'trading_halted'   : self.trading_halted,
            'halt_reason'      : self.halt_reason,
            'bar_counter'      : self.bar_counter,
            'stop_out_symbols' : list(self.stop_out_log.keys()),
        }
