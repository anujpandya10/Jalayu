"""
HFT Trade Logger
CSV trade journal + rich console output.
Tracks win rate, P&L per session, and running drawdown.
"""

import csv
import os
import time
from datetime import datetime
from typing import Optional

from colorama import Fore, Style, init as colorama_init
from tabulate import tabulate

colorama_init(autoreset=True)

LOG_DIR    = './logs'
TRADE_LOG  = f'{LOG_DIR}/trades.csv'
SESSION_LOG = f'{LOG_DIR}/session_summary.csv'

TRADE_FIELDS = [
    'timestamp', 'symbol', 'asset_type', 'direction',
    'entry_price', 'exit_price', 'shares',
    'gross_pnl', 'net_pnl', 'exit_reason',
    'session_mode', 'hold_seconds',
]


def _ensure_logs():
    os.makedirs(LOG_DIR, exist_ok=True)

    if not os.path.exists(TRADE_LOG):
        with open(TRADE_LOG, 'w', newline='') as f:
            csv.DictWriter(f, fieldnames=TRADE_FIELDS).writeheader()

    if not os.path.exists(SESSION_LOG):
        with open(SESSION_LOG, 'w', newline='') as f:
            csv.DictWriter(f, fieldnames=[
                'timestamp', 'event', 'session_mode',
                'cash', 'total_profit', 'win_rate',
                'total_trades', 'note',
            ]).writeheader()


class TradeLogger:
    """
    Writes every trade to CSV and prints formatted console output.
    Maintains running counters for live win rate and P&L display.
    """

    def __init__(self):
        _ensure_logs()
        self._trade_count    : int   = 0
        self._win_count      : int   = 0
        self._loss_count     : int   = 0
        self._total_pnl      : float = 0.0
        self._session_start  : float = time.time()

    # ── Trade Recording ────────────────────────────────────────────────────────
    def log_trade(
        self,
        symbol       : str,
        asset_type   : str,
        direction    : str,
        entry_price  : float,
        exit_price   : float,
        shares       : float,
        gross_pnl    : float,
        net_pnl      : float,
        exit_reason  : str,
        session_mode : str,
        entry_time   : float,
    ):
        hold_secs = round(time.time() - entry_time, 1)

        row = {
            'timestamp'   : datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'symbol'      : symbol,
            'asset_type'  : asset_type,
            'direction'   : direction,
            'entry_price' : round(entry_price, 8),
            'exit_price'  : round(exit_price, 8),
            'shares'      : round(shares, 8),
            'gross_pnl'   : round(gross_pnl, 4),
            'net_pnl'     : round(net_pnl, 4),
            'exit_reason' : exit_reason,
            'session_mode': session_mode,
            'hold_seconds': hold_secs,
        }

        with open(TRADE_LOG, 'a', newline='') as f:
            csv.DictWriter(f, fieldnames=TRADE_FIELDS).writerow(row)

        # Update counters
        self._trade_count += 1
        self._total_pnl    = round(self._total_pnl + net_pnl, 4)
        if net_pnl > 0:
            self._win_count  += 1
        elif net_pnl < 0:
            self._loss_count += 1

        self._print_trade(row)

    def _print_trade(self, row: dict):
        pnl     = row['net_pnl']
        dir_tag = row['direction']

        # Direction colour
        if dir_tag == 'LONG':
            dir_str = Fore.GREEN + 'LONG ' + Style.RESET_ALL
        else:
            dir_str = Fore.YELLOW + 'SHORT' + Style.RESET_ALL

        # P&L colour
        if pnl > 0:
            pnl_str = Fore.GREEN + f'+${pnl:.4f}' + Style.RESET_ALL
        elif pnl < 0:
            pnl_str = Fore.RED   + f'-${abs(pnl):.4f}' + Style.RESET_ALL
        else:
            pnl_str = Fore.WHITE + f'${pnl:.4f}' + Style.RESET_ALL

        wr = self.win_rate()

        print(
            f"  {Fore.CYAN}[{row['timestamp']}]{Style.RESET_ALL}"
            f"  {dir_str}"
            f"  {row['symbol']:<14}"
            f"  {row['entry_price']:.6f} → {row['exit_price']:.6f}"
            f"  {pnl_str}"
            f"  {row['exit_reason']:<18}"
            f"  {Fore.MAGENTA}WR {wr}%{Style.RESET_ALL}"
            f"  hold {row['hold_seconds']}s"
        )

    # ── Signal / Order Events (non-trade) ─────────────────────────────────────
    def log_signal(self, symbol: str, direction: str, score: float, reasons: list):
        icon  = '▲' if direction == 'LONG' else '▼'
        color = Fore.GREEN if direction == 'LONG' else Fore.RED
        print(
            f"  {color}{icon} SIGNAL{Style.RESET_ALL}"
            f"  {symbol:<14}"
            f"  score={score:.1f}"
            f"  {' | '.join(reasons[:3])}"
        )

    def log_entry(self, symbol: str, direction: str, price: float, shares: float,
                  tp: float, sl: float, session_mode: str):
        color = Fore.GREEN if direction == 'LONG' else Fore.YELLOW
        print(
            f"  {color}{'BUY ' if direction == 'LONG' else 'SHORT'}{Style.RESET_ALL}"
            f"  {symbol:<14}"
            f"  @ {price:.6f}  qty={shares:.6f}"
            f"  TP={tp:.6f}  SL={sl:.6f}"
            f"  [{session_mode}]"
        )

    def log_halt(self, reason: str):
        print(f"\n  {Fore.RED}{'━'*60}")
        print(f"  ⛔  TRADING HALTED: {reason}")
        print(f"  {'━'*60}{Style.RESET_ALL}\n")

    def log_session_event(
        self,
        event        : str,
        session_mode : str,
        cash         : float,
        total_profit : float,
        total_trades : int,
        note         : str = '',
    ):
        row = {
            'timestamp'   : datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            'event'       : event,
            'session_mode': session_mode,
            'cash'        : round(cash, 2),
            'total_profit': round(total_profit, 2),
            'win_rate'    : self.win_rate(),
            'total_trades': total_trades,
            'note'        : note,
        }
        with open(SESSION_LOG, 'a', newline='') as f:
            csv.DictWriter(f, fieldnames=list(row.keys())).writerow(row)

        color = Fore.CYAN if 'SESSION_2' in event else Fore.MAGENTA
        print(f"\n  {color}◆ {event}: {note}{Style.RESET_ALL}")
        print(f"    Cash=${cash:.2f}  Profit=${total_profit:.2f}  WR={self.win_rate()}%\n")

    # ── Dashboard ─────────────────────────────────────────────────────────────
    def print_status_header(
        self,
        cash          : float,
        session_mode  : str,
        open_positions: int,
        bar_counter   : int,
        phase         : str,
        halt_status   : dict,
    ):
        """Print a compact status bar at the top of each scan cycle."""
        profit = cash - 100.0  # relative to seed
        pnl_color = Fore.GREEN if profit >= 0 else Fore.RED
        halt_str  = f"  {Fore.RED}[HALTED]{Style.RESET_ALL}" if halt_status.get('trading_halted') else ''

        print(
            f"\n{Fore.WHITE}{'─'*80}{Style.RESET_ALL}"
            f"\n  Bar #{bar_counter:<5}"
            f"  Phase: {Fore.YELLOW}{phase}{Style.RESET_ALL}"
            f"  Cash: {pnl_color}${cash:.2f}{Style.RESET_ALL}"
            f"  P&L: {pnl_color}{'+' if profit >= 0 else ''}${profit:.2f}{Style.RESET_ALL}"
            f"  Positions: {open_positions}"
            f"  Session: {Fore.CYAN}{session_mode}{Style.RESET_ALL}"
            f"  WR: {self.win_rate()}%"
            f"  Trades: {self._trade_count}"
            + halt_str
        )

    def print_full_summary(
        self,
        session_status : dict,
        risk_status    : dict,
        open_positions : list,
    ):
        """Rich tabular summary — call at end of session or on demand."""
        print(f"\n{Fore.CYAN}{'═'*80}")
        print(f"  JALAYU HFT ENGINE — TRADING SUMMARY")
        print(f"{'═'*80}{Style.RESET_ALL}\n")

        # Session metrics
        sess_rows = [
            ['Mode',            session_status.get('mode')],
            ['Available Cash',  f"${session_status.get('available_cash', 0):.2f}"],
            ['Seed Capital',    f"${session_status.get('seed_capital', 0):.2f}"],
            ['Total Profit',    f"${session_status.get('total_profit', 0):.2f}"],
            ['Session 2 Pct',   f"{session_status.get('pct_to_session2', 0):.1f}%"],
            ['Total Trades',    session_status.get('total_trades', 0)],
            ['Win Rate',        f"{session_status.get('win_rate', 0):.1f}%"],
            ['Wins / Losses',   f"{session_status.get('winning_trades', 0)} / {session_status.get('losing_trades', 0)}"],
        ]
        print(tabulate(sess_rows, headers=['Metric', 'Value'], tablefmt='rounded_outline'))

        # Risk metrics
        print()
        risk_rows = [
            ['Current P&L',    f"${risk_status.get('current_pnl', 0):.2f}"],
            ['Daily High',      f"${risk_status.get('daily_high_pnl', 0):.2f}"],
            ['Drawdown',        f"{risk_status.get('drawdown_pct', 0):.2f}%"],
            ['Trading Halted',  '⛔ YES' if risk_status.get('trading_halted') else '✓  NO'],
            ['Halt Reason',     risk_status.get('halt_reason', '—')[:60]],
            ['Bar Counter',     risk_status.get('bar_counter', 0)],
        ]
        print(tabulate(risk_rows, headers=['Risk Metric', 'Value'], tablefmt='rounded_outline'))

        # Open positions
        if open_positions:
            print(f"\n  {Fore.YELLOW}Open Positions ({len(open_positions)}):{Style.RESET_ALL}")
            pos_rows = []
            for p in open_positions:
                symbol    = p.get('symbol', '?')
                direction = p.get('direction', 'LONG')
                entry     = p.get('entry_price', 0)
                current   = p.get('current_price', entry)
                shares    = p.get('shares', 0)
                if direction == 'LONG':
                    pnl = (current - entry) * shares
                else:
                    pnl = (entry - current) * shares
                pnl_str = f"+${pnl:.4f}" if pnl >= 0 else f"-${abs(pnl):.4f}"
                pos_rows.append([symbol, direction, f'{entry:.6f}', f'{current:.6f}', f'{shares:.6f}', pnl_str])

            print(tabulate(
                pos_rows,
                headers=['Symbol', 'Dir', 'Entry', 'Current', 'Qty', 'Unrealized P&L'],
                tablefmt='simple'
            ))

        print(f"\n{Fore.CYAN}{'═'*80}{Style.RESET_ALL}\n")

    # ── Helpers ────────────────────────────────────────────────────────────────
    def win_rate(self) -> float:
        if self._trade_count == 0:
            return 0.0
        return round(self._win_count / self._trade_count * 100, 1)

    def total_pnl(self) -> float:
        return self._total_pnl
