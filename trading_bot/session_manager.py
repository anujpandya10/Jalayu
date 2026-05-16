"""
HFT Session Manager
Handles the two-session capital rotation:
  Session 1: Trade crypto/forex with $100 seed. Target: $50 profit.
  Session 2: Lock seed, deploy profits to stocks + keep crypto/forex running.
"""

import json
import os
import time
from dataclasses import dataclass, asdict, field
from typing import Literal, Optional
from config import (
    SEED_CAPITAL,
    SESSION1_PROFIT_TARGET,
    SESSION2_STOCK_ALLOC,
)

SESSION_STATE_FILE = './logs/session_state.json'

SessionMode = Literal['SESSION_1', 'SESSION_2']


@dataclass
class SessionState:
    mode          : SessionMode = 'SESSION_1'
    seed_capital  : float = SEED_CAPITAL       # $100 — never touched after lock
    session1_peak : float = 0.0               # highest equity seen in Session 1
    session2_start_equity: float = 0.0        # equity when Session 2 began
    promoted_at   : Optional[float] = None    # Unix timestamp of Session 2 unlock

    # Running totals (reset on midnight daily reset, not on session change)
    total_realized_pnl : float = 0.0
    total_trades       : int   = 0
    winning_trades     : int   = 0
    losing_trades      : int   = 0

    # Session 2 stock allocation tracking
    stock_capital      : float = 0.0  # amount deployed to stocks
    crypto_capital     : float = 0.0  # amount kept in crypto/forex

    # Current liquid cash available to the engine (updated every tick)
    available_cash     : float = SEED_CAPITAL


class SessionManager:
    """
    Manages the lifecycle of the two trading sessions and provides
    the engine with the correct capital allocation at any point.
    """

    def __init__(self):
        self.state = self._load_state()

    # ── Persistence ────────────────────────────────────────────────────────────
    def _load_state(self) -> SessionState:
        os.makedirs('./logs', exist_ok=True)
        if os.path.exists(SESSION_STATE_FILE):
            try:
                with open(SESSION_STATE_FILE, 'r') as f:
                    data = json.load(f)
                return SessionState(**data)
            except Exception:
                pass
        return SessionState()

    def _save_state(self):
        with open(SESSION_STATE_FILE, 'w') as f:
            json.dump(asdict(self.state), f, indent=2)

    # ── Session Progression ────────────────────────────────────────────────────
    def current_profit(self) -> float:
        """Net profit above seed capital."""
        return self.state.available_cash - self.state.seed_capital

    def check_session_promotion(self) -> bool:
        """
        Check if we've hit the Session 1 profit target.
        If yes, lock the seed and allocate profits to Session 2.
        Returns True if promotion just happened.
        """
        if self.state.mode != 'SESSION_1':
            return False

        profit = self.current_profit()

        # Track peak for drawdown reference
        if self.state.available_cash > self.state.session1_peak:
            self.state.session1_peak = self.state.available_cash

        if profit >= SESSION1_PROFIT_TARGET:
            self._promote_to_session2()
            return True

        return False

    def _promote_to_session2(self):
        """Lock seed capital and split profits: 90% stocks, 10% crypto."""
        profit = self.current_profit()
        self.state.mode = 'SESSION_2'
        self.state.session2_start_equity = self.state.available_cash
        self.state.promoted_at = time.time()

        # Allocate profit slice to stocks
        self.state.stock_capital  = round(profit * SESSION2_STOCK_ALLOC, 2)
        self.state.crypto_capital = round(profit * (1 - SESSION2_STOCK_ALLOC), 2)
        # Seed stays in crypto/forex as base

        self._save_state()

    # ── Capital Allocation ─────────────────────────────────────────────────────
    def get_tradeable_cash(self, asset_type: str) -> float:
        """
        Returns how much cash is available for a given asset class.

        Session 1: everything goes to crypto/forex (no stocks unless stock hours)
        Session 2: stocks get their allocated slice, crypto/forex keep seed + remainder
        """
        if self.state.mode == 'SESSION_1':
            if asset_type == 'stock':
                return 0.0  # No stocks until Session 2
            return self.state.available_cash

        else:  # SESSION_2
            if asset_type == 'stock':
                return self.state.stock_capital
            else:
                # Seed + crypto profit slice
                return self.state.seed_capital + self.state.crypto_capital

    def update_cash(self, delta: float, asset_type: str = 'crypto'):
        """
        Called after every trade closes to update the running cash balance.
        In Session 2, stock profits update the stock_capital bucket.
        """
        if self.state.mode == 'SESSION_2' and asset_type == 'stock':
            self.state.stock_capital = round(self.state.stock_capital + delta, 4)
        else:
            self.state.available_cash = round(self.state.available_cash + delta, 4)

        self._save_state()

    # ── Trade Recording ────────────────────────────────────────────────────────
    def record_trade(self, pnl: float, asset_type: str = 'crypto'):
        """Update win/loss counters and total realized P&L."""
        self.state.total_trades     += 1
        self.state.total_realized_pnl = round(self.state.total_realized_pnl + pnl, 4)

        if pnl > 0:
            self.state.winning_trades += 1
        elif pnl < 0:
            self.state.losing_trades  += 1

        self.update_cash(pnl, asset_type)

    # ── Summary ────────────────────────────────────────────────────────────────
    def win_rate(self) -> float:
        """Win rate as a percentage (0–100)."""
        if self.state.total_trades == 0:
            return 0.0
        return round(self.state.winning_trades / self.state.total_trades * 100, 1)

    def get_status(self) -> dict:
        profit      = self.current_profit()
        pct_to_goal = 0.0
        if SESSION1_PROFIT_TARGET > 0 and self.state.mode == 'SESSION_1':
            pct_to_goal = min(100.0, round(profit / SESSION1_PROFIT_TARGET * 100, 1))

        return {
            'mode'               : self.state.mode,
            'available_cash'     : round(self.state.available_cash, 2),
            'seed_capital'       : self.state.seed_capital,
            'total_profit'       : round(profit, 2),
            'pct_to_session2'    : pct_to_goal,
            'total_trades'       : self.state.total_trades,
            'winning_trades'     : self.state.winning_trades,
            'losing_trades'      : self.state.losing_trades,
            'win_rate'           : self.win_rate(),
            'total_realized_pnl' : round(self.state.total_realized_pnl, 4),
            'stock_capital'      : round(self.state.stock_capital, 2),
            'crypto_capital'     : round(self.state.crypto_capital, 2),
        }

    def daily_reset(self, risk_manager_pnl: float):
        """
        Called at midnight. Carries forward session state, resets daily
        trade counters but NOT lifetime counters.
        """
        # Session state persists — we don't lose Session 2 status
        # Daily trade counts stay as lifetime counts (the risk manager resets daily)
        self._save_state()
