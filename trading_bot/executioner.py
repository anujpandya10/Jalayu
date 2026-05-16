"""
╔══════════════════════════════════════════════════════════════════════╗
║  PERSONA 3 — THE AGGRESSIVE EXECUTIONER                              ║
║  The Risk & Recovery Engine                                          ║
║                                                                      ║
║  Responsibilities:                                                   ║
║  • Execute trades from approved TradeProposals (5–10s intervals)     ║
║  • Martingale-Lite recovery: scale up size ONLY when prob > 90%      ║
║  • Hard ATR trailing stops — instant exit, no emotional holding      ║
║  • Compounding loop: crypto profits → forex → US equities            ║
║  • Track recovery debt and clear it systematically                   ║
╚══════════════════════════════════════════════════════════════════════╝
"""

import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np

from config import (
    SIMULATED_FEE_PCT, SLIPPAGE_PCT,
    CRYPTO_TP_PCT, CRYPTO_SL_PCT,
    FOREX_TP_PCT,  FOREX_SL_PCT,
    STOCK_TP_PCT,  STOCK_SL_PCT,
    ATR_TRAILING_MULT,
)
from indicators import update_trailing_stop
from quant_historian import TradeProposal
from risk_manager import RiskManager
from session_manager import SessionManager
from logger import TradeLogger


# ── Execution Result ──────────────────────────────────────────────────────────
@dataclass
class ExecutionResult:
    symbol      : str
    direction   : str
    entry_price : float
    shares      : float
    tp_price    : float
    sl_price    : float
    sizing_tier : str   # 'BASE' | 'RECOVERY_1' | 'RECOVERY_2' | 'MAX_RECOVERY'
    historian_id: int   # DB row ID for outcome recording
    timestamp   : float = field(default_factory=time.time)


# ── Compounding Bucket ─────────────────────────────────────────────────────────
@dataclass
class CompoundBucket:
    """
    Tracks profit within one asset class.
    When profit exceeds ROTATE_THRESHOLD, the surplus is
    allocated to the next bucket in the rotation chain.

    Rotation chain: CRYPTO → FOREX → STOCKS → (loop)
    """
    asset_type      : str
    capital         : float          # current tradeable capital
    lifetime_profit : float = 0.0
    rotate_threshold: float = 20.0  # rotate $20 profit slices


# ═══════════════════════════════════════════════════════════════════════════════
# MARTINGALE-LITE RECOVERY PROTOCOL
#
#  After a losing trade:
#    loss_debt += |net_pnl|
#
#  On next approved trade:
#    IF probability_score > 0.90:
#       recovery_multiplier = min(MAX_MULT, 1 + (loss_debt / base_risk))
#       position_size *= recovery_multiplier
#       IF trade wins: loss_debt = max(0, loss_debt - net_pnl)
#       IF trade loses: loss_debt += |net_pnl|   (compound debt — but cap at 3 losses)
#
#  Hard caps:
#    recovery_multiplier never exceeds 3.0 (no classic martingale doubling spiral)
#    After 3 consecutive losses → PAUSE 2 bars, reset multiplier to 1.0
#    The risk manager's 20% drawdown halt overrides everything
#
# ═══════════════════════════════════════════════════════════════════════════════

RECOVERY_PROB_THRESHOLD = 0.90    # Only scale up if probability > 90%
MAX_RECOVERY_MULT       = 3.0     # Hard cap on position scale-up
CONSECUTIVE_LOSS_LIMIT  = 3       # Force pause after N consecutive losses
PAUSE_BARS_AFTER_STREAK = 2       # Bars to wait after hitting the limit

# Per-tier multipliers
RECOVERY_TIERS = {
    0: (1.0,  'BASE'),
    1: (1.5,  'RECOVERY_1'),
    2: (2.0,  'RECOVERY_2'),
    3: (3.0,  'MAX_RECOVERY'),
}


class Executioner:
    """
    Converts approved TradeProposals into real (or simulated) orders.
    Manages the Martingale-Lite recovery state and the compounding loop.
    """

    def __init__(
        self,
        risk   : RiskManager,
        session: SessionManager,
        logger : TradeLogger,
        alpaca = None,   # Optional Alpaca REST client
    ):
        self.risk    = risk
        self.session = session
        self.logger  = logger
        self.alpaca  = alpaca

        # ── Recovery state ────────────────────────────────────────────────────
        self._loss_debt         : float = 0.0   # cumulative unrecovered loss
        self._consecutive_losses: int   = 0
        self._recovery_tier     : int   = 0     # current RECOVERY_TIERS key
        self._pause_bars        : int   = 0     # bars remaining in forced pause

        # ── Compounding buckets ───────────────────────────────────────────────
        #  Chain: crypto → forex → stock
        self._buckets: dict[str, CompoundBucket] = {
            'crypto': CompoundBucket('crypto', self.session.state.available_cash),
            'forex' : CompoundBucket('forex',  0.0),
            'stock' : CompoundBucket('stock',  0.0),
        }

        # ── Open positions tracking ───────────────────────────────────────────
        # symbol → {'proposal': TradeProposal, 'result': ExecutionResult,
        #            'current_price': float, 'historian_id': int, 'atr': float}
        self._open: dict = {}

    # ═══════════════════════════════════════════════════════════════════════════
    # COMPOUNDING CALCULATION LOOP
    #
    # How capital rotates across asset classes:
    #
    #   1. Engine starts: all capital in CRYPTO bucket.
    #   2. After every profitable close: profit added to CRYPTO bucket.
    #   3. When crypto bucket profit ≥ ROTATE_THRESHOLD ($20):
    #        rotate_amount = profit surplus above threshold
    #        FOREX bucket += rotate_amount × 0.40
    #        STOCK bucket += rotate_amount × 0.60 (only in Session 2)
    #        CRYPTO bucket: keep seed + threshold as operating base
    #   4. FOREX bucket earns → when its profit ≥ threshold:
    #        excess flows back to CRYPTO (reinforce the base)
    #   5. STOCK bucket (Session 2 only):
    #        earns aggressively during market hours
    #        after-hours: convert stock profits → crypto bucket
    #
    # This creates a self-reinforcing compounding spiral.
    # ═══════════════════════════════════════════════════════════════════════════

    def _rotate_profits(self, asset_type: str, profit: float):
        """
        Called after every winning close.
        Decides whether to rotate surplus profit to the next bucket.
        """
        bucket = self._buckets[asset_type]
        bucket.capital         += profit
        bucket.lifetime_profit += profit

        if bucket.lifetime_profit < bucket.rotate_threshold:
            return  # Not enough surplus to rotate yet

        surplus = bucket.lifetime_profit - bucket.rotate_threshold
        bucket.lifetime_profit = bucket.rotate_threshold  # Reset above threshold

        session_mode = self.session.state.mode

        if asset_type == 'crypto':
            # Crypto surplus → 40% forex, 60% stocks (if Session 2)
            forex_alloc = round(surplus * 0.40, 4)
            stock_alloc = round(surplus * 0.60, 4) if session_mode == 'SESSION_2' else 0.0

            self._buckets['forex'].capital  += forex_alloc
            self._buckets['stock'].capital  += stock_alloc

            # Any remainder stays in crypto if stocks not yet unlocked
            if session_mode == 'SESSION_1':
                self._buckets['crypto'].capital += stock_alloc

            self.logger.log_session_event(
                'PROFIT_ROTATION',
                session_mode,
                self._buckets['crypto'].capital,
                bucket.lifetime_profit,
                0,
                f'${surplus:.2f} rotated → forex ${forex_alloc:.2f} | stock ${stock_alloc:.2f}'
            )

        elif asset_type == 'forex':
            # Forex surplus → reinforce crypto base (consistent compounder)
            self._buckets['crypto'].capital  += surplus
            self._buckets['crypto'].lifetime_profit += surplus

        elif asset_type == 'stock':
            # Stock profits after-hours → back to crypto for 24/7 trading
            from engine import HFTEngine  # avoid circular at module level
            self._buckets['crypto'].capital += surplus

    def get_bucket_capital(self, asset_type: str) -> float:
        return round(self._buckets[asset_type].capital, 4)

    # ── Martingale-Lite Position Sizing ───────────────────────────────────────
    def _compute_recovery_multiplier(self, probability_score: float) -> tuple[float, str]:
        """
        Returns (multiplier, tier_label).
        Only scales up if:
          1. There is unrecovered loss debt
          2. The current probability score is above the threshold
          3. We haven't hit the consecutive-loss cap
        """
        if self._pause_bars > 0:
            return 1.0, 'PAUSED'

        if self._loss_debt <= 0 or self._consecutive_losses == 0:
            return 1.0, 'BASE'

        if probability_score < RECOVERY_PROB_THRESHOLD:
            return 1.0, 'BASE'  # Not confident enough — do NOT scale

        tier_mult, tier_label = RECOVERY_TIERS.get(
            min(self._recovery_tier, 3),
            (1.0, 'BASE')
        )
        return tier_mult, tier_label

    def _on_win(self, net_pnl: float, asset_type: str):
        """Called when a trade closes profitably."""
        self._consecutive_losses = 0
        self._pause_bars         = 0

        recovered = min(self._loss_debt, net_pnl)
        self._loss_debt = max(0.0, self._loss_debt - net_pnl)

        if self._loss_debt <= 0:
            self._recovery_tier = 0  # Fully recovered — reset tier

        self._rotate_profits(asset_type, net_pnl)

    def _on_loss(self, net_pnl: float, asset_type: str):
        """Called when a trade closes at a loss."""
        loss_abs = abs(net_pnl)
        self._loss_debt           += loss_abs
        self._consecutive_losses  += 1
        self._buckets[asset_type].capital = max(0.0, self._buckets[asset_type].capital - loss_abs)

        # Escalate recovery tier
        self._recovery_tier = min(3, self._consecutive_losses)

        if self._consecutive_losses >= CONSECUTIVE_LOSS_LIMIT:
            self._pause_bars        = PAUSE_BARS_AFTER_STREAK
            self._consecutive_losses = 0   # Reset streak counter, NOT loss debt
            self.logger.log_halt(
                f'RECOVERY PAUSE: {CONSECUTIVE_LOSS_LIMIT} consecutive losses. '
                f'Waiting {PAUSE_BARS_AFTER_STREAK} bars. '
                f'Debt: ${self._loss_debt:.4f}'
            )

    def tick_pause(self):
        """Called once per bar. Counts down the recovery pause."""
        if self._pause_bars > 0:
            self._pause_bars -= 1

    # ── Core Execute ──────────────────────────────────────────────────────────
    def execute(
        self,
        proposal  : TradeProposal,
        historian_id: int,
        grittani_trade_id: str = '',
    ) -> Optional[ExecutionResult]:
        """
        Opens a position for an approved TradeProposal.
        Returns ExecutionResult, or None if the trade is blocked.
        """
        if self._pause_bars > 0:
            return None  # In forced recovery pause

        if not proposal.approved:
            return None

        symbol      = proposal.symbol
        asset_type  = proposal.asset_type
        direction   = proposal.direction
        price       = proposal.price
        atr         = proposal.atr

        # ── Recovery multiplier ────────────────────────────────────────────
        mult, tier = self._compute_recovery_multiplier(proposal.probability_score)

        # ── Base position size from risk manager ───────────────────────────
        available = self.get_bucket_capital(asset_type)
        if available < 2.0:
            return None  # Not enough capital in this bucket

        base_shares = self.risk.calculate_position_size(
            cash=available, price=price, atr=atr, direction=direction
        )
        if base_shares <= 0:
            return None

        # Apply recovery multiplier (but cap total position value)
        shares     = base_shares * mult
        max_shares = (available * 0.30) / price  # Never exceed 30% of bucket
        shares     = min(shares, max_shares)
        shares     = round(shares, 8)

        # ── Adjusted execution price (slippage + fees) ─────────────────────
        exec_price = self.risk.apply_fees_and_slippage(
            price,
            'BUY' if direction == 'LONG' else 'SHORT_OPEN'
        )

        # ── TP / SL ────────────────────────────────────────────────────────
        tp = self.risk.minimum_tp_price(exec_price, shares, direction, asset_type)
        sl = self.risk.maximum_sl_price(exec_price, atr, direction, asset_type)

        # Log entry
        self.logger.log_entry(symbol, direction, exec_price, shares, tp, sl, self.session.state.mode)

        result = ExecutionResult(
            symbol      = symbol,
            direction   = direction,
            entry_price = exec_price,
            shares      = shares,
            tp_price    = tp,
            sl_price    = sl,
            sizing_tier = tier,
            historian_id= historian_id,
        )

        # Store in open positions
        self._open[symbol] = {
            'result'           : result,
            'proposal'         : proposal,
            'current_price'    : price,
            'atr'              : atr,
            'asset_type'       : asset_type,
            'entry_time'       : time.time(),
            'grittani_trade_id': grittani_trade_id,
        }

        # Deduct from bucket immediately (reserving capital)
        self._buckets[asset_type].capital -= round(exec_price * shares, 4)

        return result

    # ── Price Update & Exit Evaluation ────────────────────────────────────────
    def update_prices(self, price_map: dict[str, float]):
        """Batch-update current prices for all open positions."""
        for symbol, price in price_map.items():
            if symbol in self._open:
                self._open[symbol]['current_price'] = price

    def evaluate_exits(self) -> list[dict]:
        """
        Check all open positions for TP/SL/trailing/time exit conditions.
        Returns list of exit dicts for the AgentSwarm to log and report.
        """
        exits = []
        to_close = []

        for symbol, pos in self._open.items():
            result    = pos['result']
            price     = pos['current_price']
            atr       = pos['atr']
            direction = result.direction

            if price <= 0:
                continue

            # ── Ratchet trailing stop ──────────────────────────────────────
            result.sl_price = update_trailing_stop(
                result.sl_price, price, atr, direction, ATR_TRAILING_MULT
            )

            reason = None

            if direction == 'LONG':
                if price >= result.tp_price:
                    reason = 'TP_HIT'
                elif price <= result.sl_price:
                    reason = 'SL_HIT'  # HARD STOP — no hesitation
            else:  # SHORT
                if price <= result.tp_price:
                    reason = 'TP_HIT'
                elif price >= result.sl_price:
                    reason = 'SL_HIT'

            # Time exits
            hold = time.time() - pos['entry_time']
            if reason is None:
                unrealized = self._unrealized(result, price)
                if hold > 90 and unrealized > 0:
                    reason = 'TIME_TP'
                elif hold > 300:
                    reason = 'TIME_STALE'

            if reason:
                to_close.append((symbol, price, reason))

        for symbol, exit_price, reason in to_close:
            exit_data = self._close(symbol, exit_price, reason)
            if exit_data:
                exits.append(exit_data)

        return exits

    def _unrealized(self, result: 'ExecutionResult', current_price: float) -> float:
        if result.direction == 'LONG':
            return (current_price - result.entry_price) * result.shares
        return (result.entry_price - current_price) * result.shares

    def _close(self, symbol: str, exit_price: float, reason: str) -> Optional[dict]:
        pos = self._open.pop(symbol, None)
        if pos is None:
            return None

        result    = pos['result']
        asset_type = pos['asset_type']

        exec_exit = self.risk.apply_fees_and_slippage(
            exit_price,
            'SELL' if result.direction == 'LONG' else 'SHORT_COVER'
        )
        net = self.risk.net_pnl(result.entry_price, exec_exit, result.shares, result.direction)
        gross = self._unrealized(result, exec_exit)

        # Return capital to bucket
        self._buckets[asset_type].capital += exec_exit * result.shares

        # Update recovery state
        if net > 0:
            self._on_win(net, asset_type)
        else:
            self._on_loss(net, asset_type)

        # Update risk manager P&L
        self.risk.update_pnl(net)
        self.session.record_trade(net, asset_type)

        self.logger.log_trade(
            symbol, asset_type, result.direction,
            result.entry_price, exec_exit, result.shares,
            gross, net, reason,
            self.session.state.mode,
            pos['entry_time'],
        )

        return {
            'symbol'           : symbol,
            'direction'        : result.direction,
            'net_pnl'          : net,
            'reason'           : reason,
            'sizing_tier'      : result.sizing_tier,
            'historian_id'     : result.historian_id,
            'asset_type'       : asset_type,
            'grittani_trade_id': pos.get('grittani_trade_id', ''),
        }

    # ── Status ────────────────────────────────────────────────────────────────
    def get_recovery_status(self) -> dict:
        return {
            'loss_debt'          : round(self._loss_debt, 4),
            'consecutive_losses' : self._consecutive_losses,
            'recovery_tier'      : self._recovery_tier,
            'pause_bars_left'    : self._pause_bars,
            'buckets'            : {
                k: round(v.capital, 4) for k, v in self._buckets.items()
            },
        }

    def open_positions(self) -> list[dict]:
        return [
            {
                'symbol'       : s,
                'direction'    : p['result'].direction,
                'entry_price'  : p['result'].entry_price,
                'current_price': p['current_price'],
                'shares'       : p['result'].shares,
                'asset_type'   : p['asset_type'],
                'sizing_tier'  : p['result'].sizing_tier,
            }
            for s, p in self._open.items()
        ]
