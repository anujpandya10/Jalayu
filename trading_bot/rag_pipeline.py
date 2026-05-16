"""
╔══════════════════════════════════════════════════════════════════════════════╗
║  KNOWLEDGE INGESTION PIPELINE (RAG)                                         ║
║  Retrieval-Augmented Generation for Trading Legend Wisdom                   ║
║                                                                             ║
║  Pipeline:                                                                  ║
║  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  ║
║  │  SCRAPER     │ →  │  CHUNKER     │ →  │  EMBEDDER    │ →  │  STORE   │  ║
║  │  (web, RSS,  │    │  (sentences, │    │  (TF-IDF     │    │  SQLite  │  ║
║  │   YouTube    │    │   paragraphs)│    │   vectors)   │    │  vector  │  ║
║  │   transcripts│    │              │    │              │    │  DB)     │  ║
║  └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘  ║
║            ↓                                                                ║
║  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                  ║
║  │  RULE        │ →  │  DYNAMIC     │ →  │  LEGEND      │                  ║
║  │  EXTRACTOR   │    │  RULE UPDATE │    │  ENGINE      │                  ║
║  │  (pattern    │    │  (scores &   │    │  PARAMETER   │                  ║
║  │   mining)    │    │   thresholds)│    │  INJECTION   │                  ║
║  └──────────────┘    └──────────────┘    └──────────────┘                  ║
╚══════════════════════════════════════════════════════════════════════════════╝
"""

import hashlib
import json
import os
import re
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import requests
from collections import defaultdict


# ─────────────────────────────────────────────────────────────────────────────
# KNOWLEDGE SOURCES
# ─────────────────────────────────────────────────────────────────────────────

LEGEND_SOURCES = {
    'SYKES': [
        # Timothy Sykes public blog / RSS
        'https://www.timothysykes.com/feed/',
        'https://www.timothysykes.com/blog/',
        # StocksToTrade blog (Sykes-affiliated)
        'https://stockstotrade.com/feed/',
    ],
    'GRITTANI': [
        # Grittani documented interviews and lesson pages
        'https://www.reddit.com/r/Daytrading/search.json?q=grittani&sort=top&t=all&limit=25',
        'https://www.reddit.com/r/pennystocks/search.json?q=grittani+lessons&sort=top&limit=25',
    ],
    'KELLOGG': [
        'https://www.reddit.com/r/Daytrading/search.json?q=jack+kellogg+strategy&sort=top&limit=25',
        'https://www.reddit.com/r/pennystocks/search.json?q=kellogg+momentum&sort=top&limit=25',
    ],
    'BUFFETT': [
        # Berkshire shareholder letters (key wisdom passages)
        'https://www.reddit.com/r/investing/search.json?q=buffett+margin+of+safety&sort=top&t=all&limit=25',
        'https://feeds.a.dj.com/rss/RSSMarketsMain.xml',   # WSJ markets (Buffett context)
    ],
    'GENERAL': [
        'https://www.reddit.com/r/Daytrading/new.json?limit=30',
        'https://www.reddit.com/r/stocks/new.json?limit=30',
        'https://www.reddit.com/r/pennystocks/new.json?limit=30',
        'https://www.reddit.com/r/wallstreetbets/new.json?limit=30',
    ],
}

# Seed knowledge: Manually curated rules from documented legend principles
# These are injected into the DB on first run so the system works immediately.
SEED_KNOWLEDGE = [
    # SYKES
    {'master': 'SYKES',    'category': 'ENTRY', 'rule': 'Buy the morning perk on first green day with 3x+ volume. Never chase after the first 30 minutes.', 'confidence': 0.95},
    {'master': 'SYKES',    'category': 'EXIT',  'rule': 'Cut losses immediately when price deviates 1-2% from setup. No holding and hoping.', 'confidence': 0.98},
    {'master': 'SYKES',    'category': 'SETUP', 'rule': 'Supernova pattern: 10x relative volume + first green day = highest probability long setup.', 'confidence': 0.92},
    {'master': 'SYKES',    'category': 'SHORT', 'rule': 'Overextension short: wait for stock up 100%+ to show first structural crack on 1-min, then scale into short.', 'confidence': 0.90},
    {'master': 'SYKES',    'category': 'RISK',  'rule': 'Small position size on breakouts, larger on dip buys near VWAP. Never all-in on momentum chasing.', 'confidence': 0.88},
    {'master': 'SYKES',    'category': 'FILTER','rule': 'Low float stocks under 10 million shares move faster. Avoid stocks with float over 50 million for momentum plays.', 'confidence': 0.93},
    # GRITTANI
    {'master': 'GRITTANI', 'category': 'SIZE',  'rule': 'Size up only when all variables align. Reward to risk must be at least 3:1. Never size up out of frustration.', 'confidence': 0.97},
    {'master': 'GRITTANI', 'category': 'SHORT', 'rule': 'Parabolic short: wait for 2nd or 3rd failed attempt at the high. Volume must be declining. RSI divergence confirms.', 'confidence': 0.94},
    {'master': 'GRITTANI', 'category': 'SETUP', 'rule': 'Bull flag breakout: stock must consolidate tightly (less than 0.5x ATR) for 5-7 bars after initial move.', 'confidence': 0.89},
    {'master': 'GRITTANI', 'category': 'RISK',  'rule': 'After 3 consecutive losses, do not increase size. Take time to review what went wrong before next trade.', 'confidence': 0.96},
    {'master': 'GRITTANI', 'category': 'ENTRY', 'rule': 'Multi-variable confirmation required. No single indicator is enough. Need volume + float + pattern + catalyst alignment.', 'confidence': 0.95},
    # KELLOGG
    {'master': 'KELLOGG',  'category': 'TAPE',  'rule': 'Read volume velocity, not just volume. Accelerating volume into a move confirms momentum. Decelerating = exit.', 'confidence': 0.93},
    {'master': 'KELLOGG',  'category': 'ENTRY', 'rule': 'Entry precision matters more than direction. Enter within 1% of the ideal level or wait for the next setup.', 'confidence': 0.91},
    {'master': 'KELLOGG',  'category': 'EXIT',  'rule': 'Three consecutive shrinking candle bodies = momentum death. Exit immediately, do not wait for stop.', 'confidence': 0.89},
    {'master': 'KELLOGG',  'category': 'SETUP', 'rule': 'Halt resume plays: position before the halt on high volume, target 20-40% gap on resume.', 'confidence': 0.85},
    # BUFFETT (adapted for HFT)
    {'master': 'BUFFETT',  'category': 'RISK',  'rule': 'Rule 1: Never lose money. Rule 2: Never forget Rule 1. If volatility is chaotic, hold cash. Opportunity will return.', 'confidence': 0.99},
    {'master': 'BUFFETT',  'category': 'ENTRY', 'rule': 'Margin of safety: only enter when price is demonstrably below fair value (VWAP floor). Never pay full price.', 'confidence': 0.97},
    {'master': 'BUFFETT',  'category': 'FILTER','rule': 'Circle of competence: only trade assets you have historical data for. Unknown patterns = stay out.', 'confidence': 0.95},
    {'master': 'BUFFETT',  'category': 'RISK',  'rule': 'When others are greedy (RSI > 80, vol spike > 10x), be fearful. When others are fearful (RSI < 25), be greedy.', 'confidence': 0.94},
    {'master': 'BUFFETT',  'category': 'SETUP', 'rule': 'Forex and large-cap crypto are within the circle of competence. Micro-cap pennies are speculation, not investment.', 'confidence': 0.92},
]


@dataclass
class KnowledgeChunk:
    """One atomic piece of legend wisdom."""
    chunk_id   : str
    master     : str       # SYKES | GRITTANI | KELLOGG | BUFFETT | GENERAL
    source_url : str
    raw_text   : str
    category   : str       # ENTRY | EXIT | SETUP | RISK | FILTER | TAPE | SHORT
    confidence : float     # 0.0 – 1.0
    keywords   : list      = field(default_factory=list)
    tfidf_vec  : list      = field(default_factory=list)   # Stored as JSON
    ingested_at: float     = field(default_factory=time.time)
    times_hit  : int       = 0   # How many times this chunk was retrieved


@dataclass
class DynamicRule:
    """An extracted trading rule with adjustable parameters."""
    rule_id    : str
    master     : str
    category   : str
    rule_text  : str
    confidence : float
    # Extracted numeric parameters (e.g., thresholds discovered from text)
    parameters : dict      = field(default_factory=dict)
    last_updated: float    = field(default_factory=time.time)


class RAGPipeline:
    """
    Retrieval-Augmented Generation pipeline for trading legend knowledge.

    Architecture:
      1. SCRAPER: Fetches web content from legend sources
      2. CHUNKER: Splits into sentence-level chunks (150-400 chars)
      3. EMBEDDER: TF-IDF vectorization (no GPU needed, runs on any machine)
      4. STORE: SQLite with JSON-serialized vectors
      5. RETRIEVER: Cosine similarity search on query
      6. RULE EXTRACTOR: Mines numeric thresholds from text
      7. RULE INJECTOR: Updates LegendEngine parameters dynamically
    """

    DB_PATH = './logs/rag_knowledge.db'

    def __init__(self):
        self._init_db()
        self._vocab      : dict  = {}    # word → index (TF-IDF vocab)
        self._idf        : dict  = {}    # word → IDF weight
        self._doc_count  : int   = 0
        self._rules      : dict  = {}    # rule_id → DynamicRule

        # Seed the DB with hand-curated legend knowledge on first run
        self._seed_if_empty()
        self._rebuild_tfidf()

    # ─────────────────────────────────────────────────────────────────────
    # DATABASE
    # ─────────────────────────────────────────────────────────────────────
    def _init_db(self):
        os.makedirs('./logs', exist_ok=True)
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        conn.executescript('''
            CREATE TABLE IF NOT EXISTS knowledge_chunks (
                chunk_id    TEXT PRIMARY KEY,
                master      TEXT NOT NULL,
                source_url  TEXT,
                raw_text    TEXT NOT NULL,
                category    TEXT DEFAULT "GENERAL",
                confidence  REAL DEFAULT 0.7,
                keywords    TEXT DEFAULT "[]",
                tfidf_vec   TEXT DEFAULT "{}",
                ingested_at REAL,
                times_hit   INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS dynamic_rules (
                rule_id      TEXT PRIMARY KEY,
                master       TEXT,
                category     TEXT,
                rule_text    TEXT,
                confidence   REAL,
                parameters   TEXT DEFAULT "{}",
                last_updated REAL
            );
            CREATE INDEX IF NOT EXISTS idx_master ON knowledge_chunks(master);
            CREATE INDEX IF NOT EXISTS idx_category ON knowledge_chunks(category);
        ''')
        conn.commit()
        conn.close()

    def _seed_if_empty(self):
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        count = conn.execute('SELECT COUNT(*) FROM knowledge_chunks').fetchone()[0]
        conn.close()
        if count == 0:
            print('  [RAG] Seeding knowledge base with legend rules...')
            for item in SEED_KNOWLEDGE:
                self._store_chunk(KnowledgeChunk(
                    chunk_id   = hashlib.md5(item['rule'].encode()).hexdigest()[:12],
                    master     = item['master'],
                    source_url = 'SEED_KNOWLEDGE',
                    raw_text   = item['rule'],
                    category   = item['category'],
                    confidence = item['confidence'],
                    keywords   = self._extract_keywords(item['rule']),
                ))
            print(f'  [RAG] Seeded {len(SEED_KNOWLEDGE)} legend rules.')

    # ─────────────────────────────────────────────────────────────────────
    # SCRAPER — fetches content from legend sources
    # ─────────────────────────────────────────────────────────────────────
    def scrape_all(self) -> int:
        """
        Fetch all configured sources. Returns total new chunks ingested.
        Designed to run in background once per hour (not every scan cycle).
        """
        total_new = 0
        headers   = {'User-Agent': 'JalayuHFT-RAG/1.0'}

        for master, urls in LEGEND_SOURCES.items():
            for url in urls:
                try:
                    resp = requests.get(url, headers=headers, timeout=8)
                    if resp.status_code != 200:
                        continue

                    if 'reddit.com' in url:
                        new = self._parse_reddit(resp.json(), master, url)
                    elif url.endswith('.xml') or 'feed' in url:
                        new = self._parse_rss(resp.text, master, url)
                    else:
                        new = self._parse_html(resp.text, master, url)

                    total_new += new
                    time.sleep(0.5)   # Reddit/RSS rate limit courtesy

                except Exception as e:
                    print(f'  [RAG] Scrape failed {url[:50]}: {e}')

        if total_new > 0:
            self._rebuild_tfidf()
            self._extract_and_update_rules()

        print(f'  [RAG] Scraped {total_new} new knowledge chunks.')
        return total_new

    def _parse_reddit(self, data: dict, master: str, url: str) -> int:
        """Parse Reddit JSON response into knowledge chunks."""
        count = 0
        for child in data.get('data', {}).get('children', []):
            post = child.get('data', {})
            title = post.get('title', '')
            body  = post.get('selftext', '')
            text  = f"{title}. {body}"[:1000]

            if len(text.strip()) < 50:
                continue

            # Only keep trading-relevant posts
            if not self._is_relevant(text):
                continue

            for chunk_text in self._chunk_text(text):
                chunk = KnowledgeChunk(
                    chunk_id   = hashlib.md5(chunk_text.encode()).hexdigest()[:12],
                    master     = master,
                    source_url = url,
                    raw_text   = chunk_text,
                    category   = self._classify_category(chunk_text),
                    confidence = 0.65,  # Reddit = lower confidence than official
                    keywords   = self._extract_keywords(chunk_text),
                )
                if self._store_chunk(chunk):
                    count += 1
        return count

    def _parse_rss(self, xml_text: str, master: str, url: str) -> int:
        """Parse RSS/Atom XML into knowledge chunks."""
        count = 0
        # Simple regex-based XML parser (no lxml dependency)
        items = re.findall(r'<item>.*?</item>', xml_text, re.DOTALL)
        for item in items[:20]:
            title = re.search(r'<title[^>]*>(.*?)</title>', item, re.DOTALL)
            desc  = re.search(r'<description[^>]*>(.*?)</description>', item, re.DOTALL)
            text  = ''
            if title: text += title.group(1) + '. '
            if desc:  text += re.sub(r'<[^>]+>', '', desc.group(1))

            text = text[:800]
            if not self._is_relevant(text) or len(text) < 50:
                continue

            for chunk_text in self._chunk_text(text):
                chunk = KnowledgeChunk(
                    chunk_id   = hashlib.md5(chunk_text.encode()).hexdigest()[:12],
                    master     = master,
                    source_url = url,
                    raw_text   = chunk_text,
                    category   = self._classify_category(chunk_text),
                    confidence = 0.75,
                    keywords   = self._extract_keywords(chunk_text),
                )
                if self._store_chunk(chunk):
                    count += 1
        return count

    def _parse_html(self, html: str, master: str, url: str) -> int:
        """Extract text from HTML, remove tags."""
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()[:3000]

        count = 0
        for chunk_text in self._chunk_text(text):
            if not self._is_relevant(chunk_text):
                continue
            chunk = KnowledgeChunk(
                chunk_id   = hashlib.md5(chunk_text.encode()).hexdigest()[:12],
                master     = master,
                source_url = url,
                raw_text   = chunk_text,
                category   = self._classify_category(chunk_text),
                confidence = 0.80,
                keywords   = self._extract_keywords(chunk_text),
            )
            if self._store_chunk(chunk):
                count += 1
        return count

    # ─────────────────────────────────────────────────────────────────────
    # CHUNKER
    # ─────────────────────────────────────────────────────────────────────
    def _chunk_text(self, text: str, min_len: int = 60, max_len: int = 400) -> list[str]:
        """
        Split text into sentence-level chunks.
        Each chunk is self-contained and retrievable.
        """
        # Split on sentence boundaries
        sentences = re.split(r'(?<=[.!?])\s+', text)
        chunks    = []
        current   = ''

        for sent in sentences:
            sent = sent.strip()
            if not sent:
                continue

            if len(current) + len(sent) < max_len:
                current += (' ' if current else '') + sent
            else:
                if len(current) >= min_len:
                    chunks.append(current.strip())
                current = sent

        if len(current) >= min_len:
            chunks.append(current.strip())

        return chunks

    # ─────────────────────────────────────────────────────────────────────
    # TF-IDF EMBEDDING (no external ML libraries required)
    # ─────────────────────────────────────────────────────────────────────
    def _tokenize(self, text: str) -> list[str]:
        return re.findall(r'\b[a-z]{3,}\b', text.lower())

    def _rebuild_tfidf(self):
        """
        Build TF-IDF vocabulary from all stored chunks.
        Called after batch ingestion or when vocab grows.
        """
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        rows = conn.execute('SELECT chunk_id, raw_text FROM knowledge_chunks').fetchall()
        conn.close()

        if not rows:
            return

        self._doc_count = len(rows)
        doc_freq: dict = defaultdict(int)

        # Document frequency pass
        for _, text in rows:
            tokens = set(self._tokenize(text))
            for t in tokens:
                doc_freq[t] += 1

        # IDF = log(N / df)
        self._idf = {
            w: np.log(self._doc_count / (df + 1))
            for w, df in doc_freq.items()
            if df >= 2  # Ignore hapax
        }
        self._vocab = {w: i for i, w in enumerate(sorted(self._idf.keys()))}

        # Recompute and store TF-IDF vectors for all chunks
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        for chunk_id, text in rows:
            vec = self._compute_tfidf(text)
            conn.execute(
                'UPDATE knowledge_chunks SET tfidf_vec = ? WHERE chunk_id = ?',
                (json.dumps(vec), chunk_id)
            )
        conn.commit()
        conn.close()

    def _compute_tfidf(self, text: str) -> dict:
        """Compute sparse TF-IDF vector as {word_index: score}."""
        tokens = self._tokenize(text)
        if not tokens:
            return {}

        tf: dict = defaultdict(int)
        for t in tokens:
            tf[t] += 1

        n = len(tokens)
        vec = {}
        for word, count in tf.items():
            if word in self._vocab and word in self._idf:
                idx   = self._vocab[word]
                score = (count / n) * self._idf[word]
                if score > 0.001:
                    vec[str(idx)] = round(score, 5)

        return vec

    def _cosine_similarity(self, a: dict, b: dict) -> float:
        """Sparse vector cosine similarity."""
        if not a or not b:
            return 0.0
        dot = sum(a.get(k, 0) * b.get(k, 0) for k in a)
        norm_a = np.sqrt(sum(v**2 for v in a.values()))
        norm_b = np.sqrt(sum(v**2 for v in b.values()))
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    # ─────────────────────────────────────────────────────────────────────
    # RETRIEVER — find relevant legend wisdom for a query
    # ─────────────────────────────────────────────────────────────────────
    def retrieve(
        self,
        query       : str,
        master      : Optional[str] = None,   # Filter by master
        category    : Optional[str] = None,   # Filter by category
        top_k       : int = 5,
        min_sim     : float = 0.05,
    ) -> list[KnowledgeChunk]:
        """
        Retrieve the top-K most relevant knowledge chunks for a query.

        Used by the Legend Engine before each trade to inject contextual wisdom.
        """
        query_vec = self._compute_tfidf(query)

        conn  = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        where = 'WHERE 1=1'
        params: list = []
        if master:
            where += ' AND master = ?'
            params.append(master)
        if category:
            where += ' AND category = ?'
            params.append(category)

        rows = conn.execute(
            f'SELECT chunk_id, master, source_url, raw_text, category, '
            f'confidence, keywords, tfidf_vec, ingested_at, times_hit '
            f'FROM knowledge_chunks {where}',
            params
        ).fetchall()
        conn.close()

        # Score by cosine similarity + confidence weight
        scored = []
        for row in rows:
            chunk_id, master_, url, text, cat, conf, kw, vec_json, ts, hits = row
            try:
                stored_vec = json.loads(vec_json) if vec_json else {}
            except Exception:
                stored_vec = {}

            sim   = self._cosine_similarity(query_vec, stored_vec)
            total = sim * 0.70 + conf * 0.30  # Weight similarity + confidence

            if total >= min_sim:
                chunk = KnowledgeChunk(
                    chunk_id   = chunk_id,
                    master     = master_,
                    source_url = url,
                    raw_text   = text,
                    category   = cat,
                    confidence = conf,
                    keywords   = json.loads(kw) if kw else [],
                    tfidf_vec  = stored_vec,
                    ingested_at= ts,
                    times_hit  = hits + 1,
                )
                scored.append((total, chunk))

        scored.sort(key=lambda x: x[0], reverse=True)

        # Update hit counters for top results
        if scored:
            top_ids = [c.chunk_id for _, c in scored[:top_k]]
            conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
            conn.execute(
                f'UPDATE knowledge_chunks SET times_hit = times_hit + 1 '
                f'WHERE chunk_id IN ({",".join("?" * len(top_ids))})',
                top_ids
            )
            conn.commit()
            conn.close()

        return [c for _, c in scored[:top_k]]

    # ─────────────────────────────────────────────────────────────────────
    # RULE EXTRACTOR — mine numeric thresholds from text
    # ─────────────────────────────────────────────────────────────────────
    def _extract_and_update_rules(self):
        """
        Scan all knowledge chunks for numeric thresholds and patterns.
        Extracts rules like "cut losses at 2%" → {stop_pct: 0.02}
        and injects them into the DynamicRule table.
        """
        patterns = {
            'stop_pct'        : r'(?:cut|stop|loss)\s+(?:at|of|around)?\s*(\d+(?:\.\d+)?)\s*%',
            'vol_mult'        : r'(\d+(?:\.\d+)?)[xX×]\s+(?:volume|vol)',
            'float_threshold' : r'(\d+(?:\.\d+)?)\s*(?:million|M)\s+(?:shares?|float)',
            'rsi_oversold'    : r'rsi\s+(?:below|under|<)\s*(\d+)',
            'rsi_overbought'  : r'rsi\s+(?:above|over|>)\s*(\d+)',
            'min_gain_pct'    : r'(?:up|gain|gained|jumped)\s+(\d+(?:\.\d+)?)\s*%',
            'rr_ratio'        : r'(\d+(?:\.\d+)?)\s*(?::|to|\-)\s*1\s+(?:risk|reward|r:r)',
        }

        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        rows = conn.execute(
            'SELECT chunk_id, master, category, raw_text, confidence '
            'FROM knowledge_chunks'
        ).fetchall()

        for chunk_id, master, category, text, confidence in rows:
            extracted: dict = {}
            text_lower = text.lower()

            for param, pattern in patterns.items():
                match = re.search(pattern, text_lower)
                if match:
                    try:
                        val = float(match.group(1))
                        if param in ('stop_pct', 'min_gain_pct'):
                            val = val / 100.0
                        elif param in ('float_threshold',):
                            val = val * 1_000_000
                        extracted[param] = val
                    except Exception:
                        pass

            if not extracted:
                continue

            rule_id = f'{master}_{category}_{chunk_id[:8]}'
            conn.execute('''
                INSERT OR REPLACE INTO dynamic_rules
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ''', (
                rule_id, master, category, text[:300],
                confidence, json.dumps(extracted), time.time()
            ))

        conn.commit()
        conn.close()

    # ─────────────────────────────────────────────────────────────────────
    # LEGEND ENGINE PARAMETER INJECTION
    # Returns aggregated parameters the Legend Engine should use
    # ─────────────────────────────────────────────────────────────────────
    def get_dynamic_parameters(self, master: str) -> dict:
        """
        Query the dynamic rules table and aggregate extracted parameters
        into a set of recommended engine settings.

        The Legend Engine calls this at startup and after each scrape.
        Weighted by confidence — higher-confidence sources dominate.
        """
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        rows = conn.execute(
            'SELECT parameters, confidence FROM dynamic_rules WHERE master = ?',
            (master,)
        ).fetchall()
        conn.close()

        if not rows:
            return {}

        param_accumulator: dict = defaultdict(list)  # param → [(value, confidence)]
        for params_json, conf in rows:
            try:
                params = json.loads(params_json)
                for key, val in params.items():
                    param_accumulator[key].append((val, conf))
            except Exception:
                pass

        # Weighted average per parameter
        result = {}
        for param, entries in param_accumulator.items():
            total_conf = sum(c for _, c in entries)
            if total_conf > 0:
                weighted_val = sum(v * c for v, c in entries) / total_conf
                result[param] = round(weighted_val, 6)

        return result

    def print_knowledge_summary(self):
        """Print a summary of what the RAG system has learned."""
        conn  = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        rows  = conn.execute('''
            SELECT master, COUNT(*) as n, ROUND(AVG(confidence),3) as avg_conf,
                   SUM(times_hit) as total_hits
            FROM knowledge_chunks
            GROUP BY master ORDER BY n DESC
        ''').fetchall()

        rules = conn.execute('SELECT COUNT(*), master FROM dynamic_rules GROUP BY master').fetchall()
        conn.close()

        print('\n  ── RAG KNOWLEDGE BASE ────────────────────────────────────')
        print(f'  {"Master":<12} {"Chunks":>7} {"Avg Conf":>10} {"Total Hits":>12}')
        for master, n, conf, hits in rows:
            print(f'  {master:<12} {n:>7} {conf:>10.3f} {hits:>12}')

        print(f'\n  Dynamic rules extracted: {sum(n for n, _ in rules)}')
        for n, master in rules:
            print(f'    {master}: {n} parameter rules')
        print()

    # ─────────────────────────────────────────────────────────────────────
    # HELPERS
    # ─────────────────────────────────────────────────────────────────────
    TRADING_KEYWORDS = {
        'volume', 'float', 'breakout', 'short', 'long', 'rsi', 'vwap',
        'momentum', 'catalyst', 'halt', 'fomo', 'supernova', 'parabolic',
        'stop', 'loss', 'profit', 'scalp', 'trade', 'penny', 'pattern',
        'flag', 'squeeze', 'sector', 'market', 'stock', 'crypto',
        'spread', 'bid', 'ask', 'level2', 'tape', 'overextended',
        'morning', 'fade', 'gap', 'resistance', 'support', 'atr',
        'consolidation', 'reversal', 'entry', 'exit', 'position',
    }

    def _is_relevant(self, text: str) -> bool:
        tokens = set(text.lower().split())
        return len(tokens & self.TRADING_KEYWORDS) >= 2

    def _extract_keywords(self, text: str) -> list[str]:
        tokens = set(text.lower().split())
        return list(tokens & self.TRADING_KEYWORDS)[:10]

    def _classify_category(self, text: str) -> str:
        text_lower = text.lower()
        if any(w in text_lower for w in ['stop', 'cut', 'exit', 'sell']):
            return 'EXIT'
        if any(w in text_lower for w in ['entry', 'buy', 'enter', 'open']):
            return 'ENTRY'
        if any(w in text_lower for w in ['short', 'fade', 'dump', 'overextended']):
            return 'SHORT'
        if any(w in text_lower for w in ['risk', 'loss', 'drawdown', 'never lose']):
            return 'RISK'
        if any(w in text_lower for w in ['pattern', 'setup', 'flag', 'breakout']):
            return 'SETUP'
        if any(w in text_lower for w in ['float', 'volume', 'filter', 'avoid']):
            return 'FILTER'
        return 'GENERAL'

    def _store_chunk(self, chunk: KnowledgeChunk) -> bool:
        """Store chunk if not already in DB. Returns True if new."""
        conn = sqlite3.connect(self.DB_PATH, check_same_thread=False)
        existing = conn.execute(
            'SELECT 1 FROM knowledge_chunks WHERE chunk_id = ?', (chunk.chunk_id,)
        ).fetchone()

        if existing:
            conn.close()
            return False

        vec = self._compute_tfidf(chunk.raw_text)
        conn.execute('''
            INSERT INTO knowledge_chunks VALUES (?,?,?,?,?,?,?,?,?,?)
        ''', (
            chunk.chunk_id, chunk.master, chunk.source_url,
            chunk.raw_text, chunk.category, chunk.confidence,
            json.dumps(chunk.keywords), json.dumps(vec),
            chunk.ingested_at, 0
        ))
        conn.commit()
        conn.close()
        return True
