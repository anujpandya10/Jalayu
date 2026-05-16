"""
╔══════════════════════════════════════════════════════════════════════╗
║  AGENT SWARM ORCHESTRATOR                                            ║
║  The Unified Multi-Agent Brain                                       ║
║                                                                      ║
║  Data flow (millisecond handoff chain):                              ║
║                                                                      ║
║  [Market Data]                                                       ║
║       │                                                              ║
║       ▼                                                              ║
║  ┌─────────────────────┐                                             ║
║  │  SENTIMENT LISTENER │  → SentimentSignal                          ║
║  │  (noise filter,     │    {direction, sentiment_weight,            ║
║  │   volume spike,     │     volume_spike, flow_score}               ║
║  │   NLP, Reddit)      │                                             ║
║  └────────┬────────────┘                                             ║
║           │                                                          ║
║           ▼  (only if direction != NEUTRAL)                          ║
║  ┌─────────────────────┐                                             ║
║  │  QUANT HISTORIAN    │  → TradeProposal                            ║
║  │  (90-day pattern    │    {approved, probability_score,            ║
║  │   match, 82% veto)  │     combined_score, rsi, vwap_dev}          ║
║  └────────┬────────────┘                                             ║
║           │                                                          ║
║           ▼  (only if approved == True)                              ║
║  ┌─────────────────────┐                                             ║
║  │  EXECUTIONER        │  → ExecutionResult                          ║
║  │  (martingale-lite,  │    {entry_price, shares, tp, sl,            ║
║  │   ATR stops,        │     sizing_tier}                            ║
║  │   compound loop)    │                                             ║
║  └────────┬────────────┘                                             ║
║           │                                                          ║
║           ▼                                                          ║
║  [Logger + Historian DB update on close]                             ║
╚══════════════════════════════════════════════════════════════════════╝
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
)
from risk_manager        import RiskManager
from session_manager     import SessionManager
from logger              import TradeLogger
from sentiment_listener  import SentimentListener
from quant_historian     import QuantHistorian
from executioner         import Executioner
from indicators          import calculate_rsi, calculate_atr, calculate_vwap, vwap_deviation_pct

# ── Legend Consensus Engine (Sykes / Grittani / Kellogg / Buffett) ────────────
from legend_engine       import LegendConsensusEngine, MarketContext
from consensus_switcher  import ConsensusSwitcher
from grittani_recovery   import GrittaniRecoveryEngine
from rag_pipeline        import RAGPipeline

try:
    import alpaca_trade_api as tradeapi
    ALPACA_OK = True
except ImportError:
    ALPACA_OK = False


# ── Swarm configuration ───────────────────────────────────────────────────────
SCAN_INTERVAL_SEC   = POLL_INTERVAL_SECONDS     # 8 seconds
MAX_CONCURRENT_SCAN = 6   # concurrent asset pairs to evaluate per cycle
RAG_SCRAPE_INTERVAL = 3600  # scrape legend sources once per hour


class AgentSwarm:
    """
    Orchestrates the three personas in a coordinated, non-blocking loop.

    Every scan cycle:
      1. Fetch OHLCV for all active assets (I/O bound — async)
      2. Run Listener on each asset (CPU light — concurrent)
      3. Run Historian on signals (CPU moderate — sequential to avoid DB lock)
      4. Run Executioner on approved proposals (order logic)
      5. Evaluate exits on all open positions
      6. Log outcomes, update Historian DB, check session promotion
    """

    def __init__(self):
        # ── Shared infrastructure ─────────────────────────────────────────
        self.risk    = RiskManager()
        self.session = SessionManager()
        self.logger  = TradeLogger()

        # ── Market data connection ────────────────────────────────────────
        self.exchange = ccxt.binance({
            'apiKey' : BINANCE_API_KEY,
            'secret' : BINANCE_API_SECRET,
            'options': {'defaultType': 'spot'},
            'enableRateLimit': True,
        })

        self.alpaca = None
        if ALPACA_OK and ALPACA_API_KEY:
            try:
                self.alpaca = tradeapi.REST(
                    ALPACA_API_KEY, ALPACA_API_SECRET, ALPACA_BASE_URL, api_version='v2'
                )
            except Exception as e:
                print(f'[AgentSwarm] Alpaca connection failed: {e}')

        # ── Original three personas ───────────────────────────────────────
        self.listener   = SentimentListener(exchange=self.exchange)
        self.historian  = QuantHistorian()
        self.executioner= Executioner(
            risk=self.risk, session=self.session,
            logger=self.logger, alpaca=self.alpaca,
        )

        # ── Legend Consensus Engine (four masters) ────────────────────────
        self.legend    = LegendConsensusEngine()   # Sykes + Grittani + Kellogg + Buffett
        self.switcher  = ConsensusSwitcher()        # Detects market regime
        self.grittani  = GrittaniRecoveryEngine()   # Multi-variable loss recovery
        self.rag       = RAGPipeline()              # Self-updating knowledge base

        # RAG: seed knowledge is loaded automatically on first run
        # Heavy scraping runs in background once per hour
        self._last_rag_scrape = 0.0

        self._running   = True
        self._bar_count = 0
        self._last_date = datetime.now().date()

    # ── Phase Detection ───────────────────────────────────────────────────────
    def _phase(self) -> str:
        now = datetime.now(timezone.utc)
        if now.weekday() >= 5:
            return 'CRYPTO_NIGHT'
        hm = now.hour * 60 + now.minute
        if hm < 480:   return 'CRYPTO_NIGHT'
        if hm < 810:   return 'PREMARKET'
        if hm < 1200:  return 'STOCK_MARKET'
        return 'AFTER_HOURS'

    def _active_pairs(self, phase: str) -> list[tuple[str, str]]:
        pairs: list[tuple[str, str]] = []
        for p in CRYPTO_PAIRS:
            pairs.append((p, 'crypto'))
        if phase in ('PREMARKET', 'AFTER_HOURS', 'CRYPTO_NIGHT'):
            for p in FOREX_PAIRS:
                pairs.append((p, 'forex'))
        if phase == 'STOCK_MARKET' and self.session.state.mode == 'SESSION_2':
            for s in STOCK_UNIVERSE[:8]:
                pairs.append((s, 'stock'))
        return pairs

    # ── I/O Helpers ───────────────────────────────────────────────────────────
    def _fetch_ohlcv(self, symbol: str, asset_type: str) -> Optional[list]:
        try:
            if asset_type in ('crypto', 'forex'):
                return self.exchange.fetch_ohlcv(symbol, CANDLE_INTERVAL, limit=CANDLE_LOOKBACK)
            elif asset_type == 'stock' and self.alpaca:
                bars = self.alpaca.get_bars(symbol, '1Min', limit=CANDLE_LOOKBACK)
                return [[int(b.t.timestamp()*1000), b.o, b.h, b.l, b.c, b.v] for b in bars]
        except Exception:
            return None

    def _fetch_price(self, symbol: str, asset_type: str) -> Optional[float]:
        try:
            if asset_type in ('crypto', 'forex'):
                t = self.exchange.fetch_ticker(symbol)
                return float(t['last'])
            elif asset_type == 'stock' and self.alpaca:
                q = self.alpaca.get_last_quote(symbol)
                return float((q.askprice + q.bidprice) / 2)
        except Exception:
            return None

    # ═══════════════════════════════════════════════════════════════════════════
    # CORE HANDOFF CHAIN: Listener → Historian → Executioner
    # ═══════════════════════════════════════════════════════════════════════════
    def _process_asset(self, symbol: str, asset_type: str, ohlcv: list) -> Optional[dict]:
        """
        Full pipeline for one asset.

        Handoff chain:
          STEP 1  Sentiment Listener   → SentimentSignal
          STEP 2  Quant Historian      → TradeProposal  (82% veto)
          STEP 3  Legend Consensus     → LegendVerdict  (Sykes/Grittani/Kellogg/Buffett)
          STEP 4  RAG Wisdom retrieval → contextual legend rules for this setup
          STEP 5  Grittani Recovery    → position size multiplier
          STEP 6  Executioner          → opens the trade
        """
        # ── STEP 1: Sentiment Listener ────────────────────────────────────
        sentiment = self.listener.build_signal(symbol, asset_type, ohlcv)

        if sentiment.direction == 'NEUTRAL' and sentiment.volume_spike < 2.5:
            return None  # No signal — skip

        # ── STEP 2: Quant Historian (82% probability veto gate) ───────────
        proposal = self.historian.evaluate(sentiment, ohlcv)

        if not proposal.approved:
            if proposal.veto_reason:
                print(
                    f'  ✗ HISTORIAN VETO  {symbol:<12}  {proposal.veto_reason}'
                    f'  [prob={proposal.probability_score*100:.1f}%  n={proposal.similar_trades}]'
                )
            return None

        # ── STEP 3: Legend Consensus Engine ──────────────────────────────
        # Build a MarketContext from available data
        closes    = [c[4] for c in ohlcv]
        prev_close= float(closes[0]) if closes else proposal.price
        highs     = [c[2] for c in ohlcv]
        lows      = [c[3] for c in ohlcv]
        vols_raw  = [c[5] for c in ohlcv]

        ctx = MarketContext(
            symbol       = symbol,
            asset_type   = asset_type,
            price        = proposal.price,
            float_shares = 0,                 # Unknown unless enriched externally
            prev_close   = prev_close,
            daily_high   = max(highs) if highs else proposal.price,
            daily_low    = min(lows)  if lows  else proposal.price,
            market_cap   = 0,
            news_score   = sentiment.news_score,
            volume_spike = sentiment.volume_spike,
            ohlcv        = ohlcv,
        )

        # Current portfolio drawdown for Buffett Rule #1
        risk_status  = self.risk.get_status()
        dd_pct       = risk_status['drawdown_pct'] / 100.0
        regime       = self.switcher.get_regime()
        verdict      = self.legend.evaluate(ctx, regime=regime, portfolio_dd_pct=dd_pct)

        if not verdict.approved:
            print(
                f'  ✗ LEGEND VETO   {symbol:<12}  '
                f'[{verdict.dominant_master}] {verdict.reasons[0] if verdict.reasons else "No signal"}'
            )
            return None

        print(
            f'  ✓ LEGEND OK     {symbol:<12}  {verdict.direction}'
            f'  consensus={verdict.consensus_score:.1f}'
            f'  Sykes={verdict.sykes_score:.0f}'
            f'  Grit={verdict.grittani_score:.0f}'
            f'  Kell={verdict.kellogg_score:.0f}'
            f'  Buff={verdict.buffett_score:.0f}'
            f'  regime={regime}'
        )

        # ── STEP 4: RAG Knowledge retrieval ──────────────────────────────
        # Pull the most relevant legend rules for this exact setup type
        query = (
            f'{verdict.direction} {asset_type} '
            f'{"supernova" if sentiment.volume_spike >= 10 else "breakout"} '
            f'{"low float" if ctx.float_shares and ctx.float_shares < 10e6 else ""} '
            f'{" ".join(verdict.patterns[:2])}'
        )
        wisdom_chunks = self.rag.retrieve(query, top_k=3, min_sim=0.03)
        if wisdom_chunks:
            top_rule = wisdom_chunks[0].raw_text[:100]
            print(f'  ◆ RAG [{wisdom_chunks[0].master}]: {top_rule}…')

        # ── STEP 5: Grittani Recovery sizing ─────────────────────────────
        import numpy as np as np_local
        atr      = proposal.atr
        sl_price = self.risk.maximum_sl_price(proposal.price, atr, verdict.direction, asset_type)
        tp_price = self.risk.minimum_tp_price(proposal.price, 100, verdict.direction, asset_type)

        recovery_plan = self.grittani.compute_recovery_plan(
            direction     = verdict.direction,
            asset_type    = asset_type,
            regime        = regime,
            entry_price   = proposal.price,
            stop_price    = sl_price,
            target_price  = tp_price,
            legend_verdict= verdict,
            rsi           = proposal.rsi,
            vwap_dev      = proposal.vwap_dev,
            vol_spike     = sentiment.volume_spike,
            atr_pct       = atr / proposal.price if proposal.price > 0 else 0,
            news_score    = sentiment.news_score,
            ohlcv         = ohlcv,
        )

        if recovery_plan.hard_blocked:
            print(f'  ✗ GRITTANI BLOCK  {recovery_plan.block_reason}')
            return None

        if recovery_plan.recovery_tier != 'HOLD_BASE':
            print(
                f'  ◆ GRITTANI RECOVERY  {recovery_plan.recovery_tier}'
                f'  size={recovery_plan.recommended_size_mult:.1f}×'
                f'  vars={recovery_plan.variable_score*7:.0f}/7'
                f'  debt=${recovery_plan.dollars_to_recover:.4f}'
            )

        # ── STEP 6: Historian records + Executioner opens ─────────────────
        # Merge the legend verdict direction into the proposal
        proposal.direction = verdict.direction  # Legend can override Historian direction

        historian_id = self.historian.record_open(proposal)

        # Pass recovery multiplier to executioner via proposal's combined_score
        # (Executioner reads combined_score to decide tier)
        proposal.combined_score = (
            proposal.combined_score * recovery_plan.recommended_size_mult
        )

        result = self.executioner.execute(proposal, historian_id)

        if result is None:
            self.historian.record_close(historian_id, 0.0)
            return None

        # Register with Grittani R-system for outcome tracking
        trade_id = f'{symbol}_{int(time.time())}'
        self.grittani.open_trade(
            trade_id     = trade_id,
            symbol       = symbol,
            asset_type   = asset_type,
            direction    = verdict.direction,
            entry_price  = result.entry_price,
            stop_price   = result.sl_price,
            target_price = result.tp_price,
            shares       = result.shares,
            legend_verdict=verdict,
            rsi          = proposal.rsi,
            vwap_dev     = proposal.vwap_dev,
            vol_spike    = sentiment.volume_spike,
            atr_pct      = atr / proposal.price if proposal.price > 0 else 0,
            news_score   = sentiment.news_score,
        )
        # Store trade_id on result so exits can close the R-unit
        result._grittani_trade_id = trade_id

        return {
            'symbol'         : symbol,
            'asset_type'     : asset_type,
            'direction'      : result.direction,
            'entry_price'    : result.entry_price,
            'shares'         : result.shares,
            'sizing_tier'    : result.sizing_tier,
            'prob'           : proposal.probability_score,
            'legend_score'   : verdict.consensus_score,
            'regime'         : regime,
            'recovery_tier'  : recovery_plan.recovery_tier,
            'dominant_master': verdict.dominant_master,
        }

    def grittani_recovery_tick(self):
        """
        After exits are processed, close any R-units that finished.
        Called once per scan cycle before entries.
        """
        for ex in getattr(self, '_pending_exits', []):
            trade_id = ex.get('grittani_trade_id')
            if trade_id:
                self.grittani.close_trade(trade_id, ex.get('net_pnl', 0.0))
        self._pending_exits = []

    # ── Exit Processing ───────────────────────────────────────────────────────
    def _process_exits(self):
        """
        Fetch current prices for open positions, then let Executioner
        evaluate all exit conditions. Record outcomes in Historian DB.
        """
        open_pos = self.executioner.open_positions()
        if not open_pos:
            return

        # Batch price update
        price_map = {}
        for p in open_pos:
            price = self._fetch_price(p['symbol'], p['asset_type'])
            if price:
                price_map[p['symbol']] = price

        self.executioner.update_prices(price_map)

        # Let Executioner decide which to close
        exits = self.executioner.evaluate_exits()

        # Record outcomes in Historian DB
        for ex in exits:
            self.historian.record_close(ex['historian_id'], ex['net_pnl'])

    # ── Rotation Alert ────────────────────────────────────────────────────────
    def _check_rotation(self):
        """
        Capital flow rotation: if Listener detects money moving
        between asset classes, log it and prioritise the destination.
        """
        rotation = self.listener.get_rotation_alert()
        if rotation:
            print(
                f'\n  ◆ ROTATION ALERT: {rotation.get("event")}'
                f'  {rotation.get("source")} → {rotation.get("target")}\n'
            )

    # ── Main Scan Cycle ───────────────────────────────────────────────────────
    async def _scan_cycle(self):
        self._bar_count    += 1
        phase               = self._phase()
        pairs               = self._active_pairs(phase)

        self.risk.increment_bar()
        self.executioner.tick_pause()
        self.grittani_recovery_tick()

        # ── RAG hourly scrape (background, non-blocking) ──────────────────
        if time.time() - self._last_rag_scrape >= RAG_SCRAPE_INTERVAL:
            asyncio.get_event_loop().run_in_executor(None, self.rag.scrape_all)
            self._last_rag_scrape = time.time()

        # ── Status header every 5 bars ────────────────────────────────────
        if self._bar_count % 5 == 0:
            rec = self.executioner.get_recovery_status()
            self.logger.print_status_header(
                cash           = self.session.state.available_cash,
                session_mode   = self.session.state.mode,
                open_positions = len(self.executioner.open_positions()),
                bar_counter    = self._bar_count,
                phase          = phase,
                halt_status    = self.risk.get_status(),
            )
            # Show Legend regime status
            print(f'  {self.switcher.status_line()}')
            # Show Grittani R-stats
            r_stats = self.grittani.get_r_stats()
            print(
                f'  Grittani R: avg={r_stats["avg_R"]:.2f}  '
                f'WR={r_stats["win_rate_R"]}%  '
                f'expectancy={r_stats["expectancy_R"]:.4f}  '
                f'debt=${r_stats["loss_debt"]:.4f}'
            )
            stats = self.historian.get_overall_stats()
            print(
                f'  Historian: {stats["total_trades"]} trades  '
                f'WR={stats["win_rate"]}%  '
                f'P&L=${stats["total_pnl"]:.4f}'
            )

        # ── Circuit breaker ───────────────────────────────────────────────
        if self.risk.check_drawdown_breach():
            self.logger.log_halt(self.risk.halt_reason)
            return

        # ── Process exits FIRST ───────────────────────────────────────────
        self._process_exits()

        # ── Session promotion check ───────────────────────────────────────
        if self.session.check_session_promotion():
            status = self.session.get_status()
            self.logger.log_session_event(
                'SESSION_2_UNLOCKED', 'SESSION_2',
                status['available_cash'], status['total_profit'],
                status['total_trades'],
                f'${status["stock_capital"]:.2f} → stocks | '
                f'${status["crypto_capital"]:.2f} → crypto'
            )

        # ── Capital rotation alert ────────────────────────────────────────
        self._check_rotation()

        # ── Scan for new entries ──────────────────────────────────────────
        import random
        random.shuffle(pairs)

        for symbol, asset_type in pairs[:MAX_CONCURRENT_SCAN]:
            if symbol in {p['symbol'] for p in self.executioner.open_positions()}:
                continue  # Already holding

            ohlcv = self._fetch_ohlcv(symbol, asset_type)
            if not ohlcv or len(ohlcv) < 20:
                continue

            # ── Feed each asset to the Consensus Switcher ─────────────────
            # This builds the regime vote for this cycle
            prev_close = float(ohlcv[0][4]) if ohlcv else 0.0  # First candle close as proxy
            sentiment_quick = self.listener._signal_cache.get(symbol)
            vol_spike = sentiment_quick.volume_spike if sentiment_quick else 1.0

            self.switcher.ingest_asset(
                symbol       = symbol,
                asset_type   = asset_type,
                ohlcv        = ohlcv,
                prev_close   = prev_close,
                volume_spike = vol_spike,
            )

            self._process_asset(symbol, asset_type, ohlcv)
            await asyncio.sleep(0.08)   # small yield to avoid rate-limit

        # ── Compute regime AFTER scanning all assets this cycle ───────────
        regime_state = self.switcher.compute_regime()
        if regime_state.active_catalysts:
            print(f'  Catalysts: {regime_state.active_catalysts}')

    # ── Midnight Reset ────────────────────────────────────────────────────────
    def _midnight_reset(self):
        self.risk.reset_daily()
        self.session.daily_reset(self.risk.current_pnl)
        self.logger.log_session_event(
            'DAILY_RESET', self.session.state.mode,
            self.session.state.available_cash,
            self.session.current_profit(),
            self.session.state.total_trades,
            'New trading day'
        )

        # Print best historical setups so far
        best = self.historian.best_setups(limit=5)
        if best:
            print('\n  ── TOP 5 SETUPS (90-day) ──────────────────────────────')
            for s in best:
                print(
                    f'  {s["asset_type"]:<6}  {s["direction"]:<5}  '
                    f'RSI={s["rsi_zone"]:<8}  '
                    f'WR={s["win_rate"]}%  '
                    f'avg=${s["avg_pnl"]:.4f}  '
                    f'n={s["sample_size"]}'
                )
            print()

    # ── Entry Point ───────────────────────────────────────────────────────────
    async def run(self):
        print(f"""
╔══════════════════════════════════════════════════════════════════════╗
║  JALAYU — AGENT SWARM HFT ENGINE                                     ║
║  Three-Persona Micro-Scalping Framework                              ║
╠══════════════════════════════════════════════════════════════════════╣
║  ◈  SENTIMENT LISTENER  →  News | Reddit | Volume Spikes            ║
║  ◈  QUANT HISTORIAN     →  90-day pattern match | 82% veto gate     ║
║  ◈  EXECUTIONER         →  Martingale-Lite | ATR stops | Compound   ║
╠══════════════════════════════════════════════════════════════════════╣
║  Mode    : {self.session.state.mode:<54}║
║  Capital : ${self.session.state.available_cash:<53.2f}║
║  Target  : $150 profit → Session 2 unlocked                         ║
║  Interval: {SCAN_INTERVAL_SEC}s scan cycle                                         ║
╚══════════════════════════════════════════════════════════════════════╝
        """)

        while self._running:
            cycle_start = time.time()

            try:
                today = datetime.now().date()
                if today != self._last_date:
                    self._midnight_reset()
                    self._last_date = today

                await self._scan_cycle()

            except KeyboardInterrupt:
                self._running = False
                break
            except Exception as e:
                print(f'  [SWARM ERROR] {e}')
                traceback.print_exc()

            elapsed   = time.time() - cycle_start
            sleep_for = max(0.1, SCAN_INTERVAL_SEC - elapsed)
            await asyncio.sleep(sleep_for)

        # ── Shutdown summary ──────────────────────────────────────────────
        self.logger.print_full_summary(
            self.session.get_status(),
            self.risk.get_status(),
            self.executioner.open_positions(),
        )

        # Final Historian stats
        stats = self.historian.get_overall_stats()
        print(f'\n  ── HISTORIAN FINAL STATS ─────────────────────────────────')
        print(f'  Trades: {stats["total_trades"]}')
        print(f'  Win Rate: {stats["win_rate"]}%')
        print(f'  Total P&L: ${stats["total_pnl"]:.4f}')
        print(f'  Best Trade: ${stats["best_trade"]:.4f}')
        print(f'  Worst Trade: ${stats["worst_trade"]:.4f}\n')

        rec = self.executioner.get_recovery_status()
        print(f'  Recovery debt at shutdown: ${rec["loss_debt"]:.4f}')
        print(f'  Final buckets: {rec["buckets"]}')
        print(f'\n  Logs saved to ./logs/')


# ── CLI ────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    swarm = AgentSwarm()
    try:
        asyncio.run(swarm.run())
    except KeyboardInterrupt:
        print('\n  Swarm shutdown by user.')
