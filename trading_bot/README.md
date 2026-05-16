# Jalayu Trading Bot (Python HFT)

Runs **on your Mac** in Terminal — not on Vercel. The Next.js Jalayu app is separate.

## Quick start

```bash
cd /Users/anujpandya/jalayu/trading_bot
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env — at minimum add Alpaca paper keys for stocks in Session 2
```

## Which script to run?

| Command | What it does |
|---------|----------------|
| `python agent_swarm.py` | **Recommended** — full pipeline: Listener → Historian → **Legend Engine** → RAG → Grittani recovery → Executioner |
| `python engine.py` | Original single-loop engine (no legend consensus) |

```bash
python agent_swarm.py
```

Press `Ctrl+C` to stop; a summary prints and logs are written under `logs/`.

## Architecture (agent_swarm.py)

1. **Sentiment Listener** — news, Reddit, volume spikes, capital rotation  
2. **Quant Historian** — 90-day pattern match, **82% win-rate veto**  
3. **Legend Consensus** — Sykes / Grittani / Kellogg / Buffett scores + Buffett Rule #1 freeze  
4. **Consensus Switcher** — `PENNY_LEGEND` vs `VALUE_SCALPER` regime  
5. **RAG pipeline** — scrapes legend knowledge hourly into SQLite  
6. **Grittani recovery** — 7-variable gate before scaling size after losses  
7. **Executioner** — positions, ATR stops, compounding buckets  

## Logs

- `logs/trades.csv` — every trade  
- `logs/session_state.json` — Session 1 → Session 2 promotion  
- `logs/trade_history.db` — Historian + RAG SQLite  

## Session rules

- **Session 1:** $100 seed, crypto + forex  
- **$50 profit** → **Session 2** unlocks US stocks (90% of profits to stock bucket)  
- **20% drawdown** from daily high → trading halt  

## Disclaimer

Paper/simulated trading only unless you wire live broker keys. Not financial advice.
