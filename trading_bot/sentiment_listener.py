"""
╔══════════════════════════════════════════════════════════════════════╗
║  PERSONA 1 — THE SENTIMENT LISTENER                                  ║
║  The News & Noise Hunter                                              ║
║                                                                      ║
║  Responsibilities:                                                   ║
║  • Ingest news feeds, social sentiment, order-book volume spikes     ║
║  • Separate "fake noise" from "actionable alpha"                     ║
║  • Detect volume multiplier > 3× 20-period MA within 1 minute        ║
║  • Track capital flow rotations between asset classes                ║
║  • Emit SentimentSignal objects to the Quant Historian               ║
╚══════════════════════════════════════════════════════════════════════╝
"""

import asyncio
import hashlib
import os
import re
import time
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
import requests

# ── Sentiment Signal (contract between Listener → Historian) ──────────────────
@dataclass
class SentimentSignal:
    symbol          : str
    asset_type      : str          # 'crypto' | 'stock' | 'forex'
    direction       : str          # 'LONG' | 'SHORT' | 'NEUTRAL'

    # Raw scores — each in [-1.0, +1.0]
    news_score      : float = 0.0  # NLP sentiment from headlines
    social_score    : float = 0.0  # Reddit/Twitter net sentiment
    volume_spike    : float = 0.0  # (current_vol / MA20_vol) — e.g. 3.7
    flow_score      : float = 0.0  # Capital rotation intensity

    # Composite weight (computed by Listener)
    sentiment_weight: float = 0.0  # Final multiplier passed to Historian

    # Metadata
    sources         : list  = field(default_factory=list)
    timestamp       : float = field(default_factory=time.time)
    headline_sample : str   = ''


# ── Keyword Libraries ─────────────────────────────────────────────────────────
BULLISH_KEYWORDS = {
    # Macro momentum
    'surge': 2.5, 'breakout': 2.5, 'rally': 2.2, 'moon': 1.8,
    'all-time high': 3.0, 'ath': 2.8, 'explode': 2.3, 'pump': 1.5,
    'adoption': 2.0, 'partnership': 1.8, 'institutional': 2.5,
    'acquisition': 2.2, 'integration': 1.6, 'launch': 1.4,
    'upgrade': 1.7, 'bullish': 2.0, 'buy': 1.2, 'accumulate': 1.8,
    'beat earnings': 3.0, 'earnings beat': 3.0, 'record revenue': 2.8,
    'fda approval': 3.5, 'short squeeze': 3.0, 'gamma squeeze': 2.8,
}

BEARISH_KEYWORDS = {
    # Macro panic
    'crash': -3.0, 'collapse': -3.0, 'dump': -2.5, 'rug': -3.5,
    'hack': -3.0, 'exploit': -2.8, 'fraud': -3.5, 'ban': -2.5,
    'lawsuit': -2.0, 'sec': -2.2, 'regulatory': -1.5, 'investigation': -2.3,
    'miss earnings': -3.0, 'layoff': -2.0, 'bankruptcy': -3.5,
    'liquidation': -3.0, 'delisting': -3.2, 'warning': -1.8,
    'bearish': -2.0, 'sell': -1.2, 'distribution': -1.5,
    'overvalued': -1.8, 'bubble': -2.0, 'correction': -1.5,
}

# Noise amplifiers — these INFLATE perceived importance but are often fake
NOISE_FLAGS = [
    'rumor', 'allegedly', 'speculation', 'unconfirmed', 'sources say',
    'could be', 'might', 'expected to', 'possible', 'considering',
]

# High-confidence signals — these INCREASE credibility weight
ALPHA_FLAGS = [
    'confirmed', 'official', 'announces', 'releases', 'signs',
    'completes', 'approved', 'files', 'reports', 'published',
]


class SentimentListener:
    """
    Continuously monitors multiple data streams and converts raw signals
    into weighted SentimentSignal objects.

    Alpha separation algorithm:
      1. Keyword NLP score (raw tone)
      2. Source credibility multiplier (official PR vs. random tweet)
      3. Volume confirmation cross-check (price moves must have volume)
      4. Noise penalty (hedged language reduces confidence)
      5. Recency decay (signals older than 15 min lose 50% weight)
    """

    def __init__(self, exchange=None):
        self.exchange        = exchange  # CCXT exchange for volume data
        self._seen_headlines : set  = set()          # dedup cache
        self._volume_history : dict = {}             # symbol → [vol, vol, ...]
        self._flow_tracker   : dict = {}             # asset_type → rolling net flow score
        self._signal_cache   : dict = {}             # symbol → last SentimentSignal

        # CryptoPanic API (free tier — no key needed for public)
        self.cryptopanic_url = 'https://cryptopanic.com/api/v1/posts/'
        self.cryptopanic_key  = os.getenv('CRYPTOPANIC_API_KEY', '')

        # NewsAPI (free tier — 100 req/day)
        self.newsapi_key = os.getenv('NEWS_API_KEY', '')
        self.newsapi_url = 'https://newsapi.org/v2/everything'

        # Reddit (no auth required for JSON feeds)
        self.reddit_feeds = {
            'crypto'  : 'https://www.reddit.com/r/CryptoCurrency/new.json?limit=25',
            'stocks'  : 'https://www.reddit.com/r/wallstreetbets/new.json?limit=25',
            'pennies' : 'https://www.reddit.com/r/pennystocks/new.json?limit=25',
        }

    # ═══════════════════════════════════════════════════════════════════════════
    # CORE: Sentiment Weight Multiplier
    # Translates raw news hype into a calibrated buy/sell signal strength.
    #
    #   sentiment_weight = (news_score × 0.35)
    #                    + (social_score × 0.25)
    #                    + (volume_spike_score × 0.30)
    #                    + (flow_score × 0.10)
    #
    # Output range: [-1.0, +1.0]
    # ═══════════════════════════════════════════════════════════════════════════
    def compute_sentiment_weight(
        self,
        news_score  : float,
        social_score: float,
        volume_spike: float,   # raw multiplier (e.g. 3.7×)
        flow_score  : float,
    ) -> float:
        # Volume spike → normalised score
        # 1.0× = neutral (0.0), 3.0× = mild (+0.5), 5×+ = strong (+1.0)
        vol_score = min(1.0, max(-1.0, (volume_spike - 1.0) / 4.0))

        weight = (
            news_score   * 0.35 +
            social_score * 0.25 +
            vol_score    * 0.30 +
            flow_score   * 0.10
        )
        return round(max(-1.0, min(1.0, weight)), 4)

    # ── NLP Keyword Scoring ───────────────────────────────────────────────────
    def _score_text(self, text: str) -> tuple[float, bool, bool]:
        """
        Returns (raw_score, is_noise, is_alpha).

        raw_score: sum of matched keyword weights, normalised to [-1, +1]
        is_noise : True if hedging language detected (reduces credibility)
        is_alpha : True if official/confirmed language detected
        """
        text_lower = text.lower()
        raw = 0.0

        for kw, score in BULLISH_KEYWORDS.items():
            if kw in text_lower:
                raw += score
        for kw, score in BEARISH_KEYWORDS.items():
            if kw in text_lower:
                raw += score   # scores are already negative

        is_noise = any(flag in text_lower for flag in NOISE_FLAGS)
        is_alpha = any(flag in text_lower for flag in ALPHA_FLAGS)

        # Noise penalty: cut score by 40%
        if is_noise:
            raw *= 0.60
        # Alpha boost: amplify score by 25%
        if is_alpha:
            raw *= 1.25

        # Normalise: cap at ±10 raw → ±1.0
        normalised = max(-1.0, min(1.0, raw / 10.0))
        return round(normalised, 4), is_noise, is_alpha

    def _dedup_key(self, text: str) -> str:
        return hashlib.md5(text[:120].encode()).hexdigest()

    # ── Volume Spike Detection ────────────────────────────────────────────────
    def _update_volume_history(self, symbol: str, current_vol: float):
        if symbol not in self._volume_history:
            self._volume_history[symbol] = []
        hist = self._volume_history[symbol]
        hist.append(current_vol)
        if len(hist) > 20:
            hist.pop(0)

    def _volume_spike_multiplier(self, symbol: str, current_vol: float) -> float:
        """
        Returns (current_vol / MA_20_vol).
        > 3.0 = actionable spike.
        Uses last 20 fetched candle volumes.
        """
        self._update_volume_history(symbol, current_vol)
        hist = self._volume_history[symbol]
        if len(hist) < 5:
            return 1.0

        ma20 = float(np.mean(hist[:-1]))  # exclude current bar
        if ma20 == 0:
            return 1.0

        return round(current_vol / ma20, 3)

    # ── Capital Flow Tracker ──────────────────────────────────────────────────
    def update_flow(self, asset_type: str, score: float):
        """
        Track which asset class is receiving the most positive sentiment.
        Money flowing OUT of crypto INTO stocks → stocks get flow boost.
        """
        if asset_type not in self._flow_tracker:
            self._flow_tracker[asset_type] = []
        self._flow_tracker[asset_type].append(score)
        if len(self._flow_tracker[asset_type]) > 10:
            self._flow_tracker[asset_type].pop(0)

    def get_flow_score(self, asset_type: str) -> float:
        """Returns rolling mean sentiment flow for an asset class."""
        hist = self._flow_tracker.get(asset_type, [])
        if not hist:
            return 0.0
        return round(float(np.mean(hist)), 4)

    def _rotation_signal(self) -> dict:
        """
        Detect capital rotation: if crypto flow < -0.3 and stock flow > +0.3,
        flag a rotation event. Engine will prioritise stocks on next cycle.
        """
        flows = {k: self.get_flow_score(k) for k in ('crypto', 'forex', 'stock')}
        rotation = {}

        # Rotation OUT of crypto → stocks
        if flows.get('crypto', 0) < -0.3 and flows.get('stock', 0) > 0.3:
            rotation['event']  = 'CRYPTO_TO_STOCK'
            rotation['source'] = 'crypto'
            rotation['target'] = 'stock'

        # Rotation OUT of stocks → crypto (after-hours flight to crypto)
        elif flows.get('stock', 0) < -0.3 and flows.get('crypto', 0) > 0.3:
            rotation['event']  = 'STOCK_TO_CRYPTO'
            rotation['source'] = 'stock'
            rotation['target'] = 'crypto'

        # Forex safe-haven rotation
        elif flows.get('forex', 0) > 0.5:
            rotation['event']  = 'RISK_OFF_FOREX'
            rotation['source'] = 'crypto'
            rotation['target'] = 'forex'

        return rotation

    # ── Feed Parsers ──────────────────────────────────────────────────────────
    def _fetch_cryptopanic(self, symbol: str) -> list[tuple[str, float]]:
        """
        Returns list of (headline, recency_weight) from CryptoPanic.
        Recency weight: <5 min = 1.0, <15 min = 0.7, older = 0.3
        """
        results = []
        try:
            currency = symbol.split('/')[0]  # BTC/USDT → BTC
            params   = {'auth_token': self.cryptopanic_key, 'currencies': currency, 'kind': 'news'}
            resp     = requests.get(self.cryptopanic_url, params=params, timeout=4)
            if resp.status_code != 200:
                return results

            for post in resp.json().get('results', [])[:10]:
                title = post.get('title', '')
                key   = self._dedup_key(title)
                if key in self._seen_headlines:
                    continue
                self._seen_headlines.add(key)

                # Recency weight
                published_at = post.get('published_at', '')
                recency = 0.5  # default
                if published_at:
                    try:
                        import datetime
                        pub_ts  = datetime.datetime.fromisoformat(published_at.replace('Z', '+00:00'))
                        age_min = (datetime.datetime.now(datetime.timezone.utc) - pub_ts).total_seconds() / 60
                        if age_min < 5:
                            recency = 1.0
                        elif age_min < 15:
                            recency = 0.7
                        elif age_min < 60:
                            recency = 0.4
                        else:
                            recency = 0.15
                    except Exception:
                        pass

                results.append((title, recency))
        except Exception:
            pass

        return results

    def _fetch_newsapi(self, query: str) -> list[tuple[str, float]]:
        """NewsAPI headlines for a given query string."""
        results = []
        if not self.newsapi_key:
            return results
        try:
            params = {
                'q': query, 'sortBy': 'publishedAt',
                'pageSize': 10, 'apiKey': self.newsapi_key,
                'language': 'en',
            }
            resp = requests.get(self.newsapi_url, params=params, timeout=4)
            if resp.status_code != 200:
                return results

            for article in resp.json().get('articles', []):
                title = article.get('title', '') or ''
                desc  = article.get('description', '') or ''
                text  = f"{title} {desc}"
                key   = self._dedup_key(text)
                if key in self._seen_headlines:
                    continue
                self._seen_headlines.add(key)
                results.append((text, 0.8))
        except Exception:
            pass
        return results

    def _fetch_reddit(self, subreddit_key: str, symbol: str) -> list[tuple[str, float]]:
        """
        Parse Reddit JSON feed, filter posts mentioning the symbol.
        Upvote score > 100 → recency boost.
        """
        results = []
        url     = self.reddit_feeds.get(subreddit_key, '')
        if not url:
            return results

        try:
            headers = {'User-Agent': 'JalayuHFT/1.0'}
            resp    = requests.get(url, headers=headers, timeout=4)
            if resp.status_code != 200:
                return results

            coin = symbol.split('/')[0].upper()
            for child in resp.json().get('data', {}).get('children', []):
                post  = child.get('data', {})
                title = post.get('title', '')
                body  = post.get('selftext', '')
                text  = f"{title} {body}"

                if coin not in text.upper():
                    continue

                key = self._dedup_key(text)
                if key in self._seen_headlines:
                    continue
                self._seen_headlines.add(key)

                # Social credibility: upvotes + comments as weight
                ups = int(post.get('ups', 0))
                comments = int(post.get('num_comments', 0))
                social_w = min(1.0, (ups + comments * 2) / 500)

                results.append((text[:300], social_w))
        except Exception:
            pass
        return results

    # ── Main: Build SentimentSignal ───────────────────────────────────────────
    def build_signal(
        self,
        symbol     : str,
        asset_type : str,
        ohlcv      : list,
        order_book : Optional[dict] = None,
    ) -> SentimentSignal:
        """
        Full pipeline: fetch → score → weight → emit SentimentSignal.
        Called by the AgentSwarm orchestrator every scan cycle.
        """
        sig = SentimentSignal(symbol=symbol, asset_type=asset_type, direction='NEUTRAL')

        # ── Step 1: Volume spike ──────────────────────────────────────────────
        if ohlcv and len(ohlcv) >= 5:
            current_vol   = float(ohlcv[-1][5])
            sig.volume_spike = self._volume_spike_multiplier(symbol, current_vol)

        # ── Step 2: News sentiment ────────────────────────────────────────────
        all_news_texts: list[tuple[str, float]] = []

        if asset_type == 'crypto':
            all_news_texts += self._fetch_cryptopanic(symbol)
        elif asset_type == 'stock':
            all_news_texts += self._fetch_newsapi(symbol.replace('/', ''))

        # Reddit for all types
        subreddit = 'crypto' if asset_type == 'crypto' else 'stocks'
        all_news_texts += self._fetch_reddit(subreddit, symbol)
        if asset_type == 'stock':
            all_news_texts += self._fetch_reddit('pennies', symbol)

        if all_news_texts:
            weighted_scores = []
            headlines = []
            for text, recency in all_news_texts:
                raw, is_noise, is_alpha = self._score_text(text)
                weighted_scores.append(raw * recency)
                headlines.append(text[:80])

            sig.news_score     = round(float(np.mean(weighted_scores)), 4)
            sig.headline_sample = headlines[0] if headlines else ''
            sig.sources.extend(['cryptopanic', 'newsapi', 'reddit'][:len(all_news_texts)])

        # ── Step 3: Social score (Reddit ratio) ──────────────────────────────
        # Reddit items are in all_news_texts — their recency = social credibility
        reddit_items = self._fetch_reddit(subreddit, symbol)
        if reddit_items:
            scores = [self._score_text(t)[0] * w for t, w in reddit_items]
            sig.social_score = round(float(np.mean(scores)), 4)

        # ── Step 4: Flow score ────────────────────────────────────────────────
        sig.flow_score = self.get_flow_score(asset_type)

        # ── Step 5: Composite sentiment weight ───────────────────────────────
        sig.sentiment_weight = self.compute_sentiment_weight(
            sig.news_score, sig.social_score, sig.volume_spike, sig.flow_score
        )

        # ── Step 6: Direction from weight ─────────────────────────────────────
        # Volume spikes ≥ 3× are the primary trigger regardless of tone
        if sig.volume_spike >= 3.0:
            # High volume + positive sentiment → LONG (momentum chase)
            # High volume + negative sentiment → SHORT (pump-and-dump fade)
            if sig.sentiment_weight > 0.1:
                sig.direction = 'LONG'
            elif sig.sentiment_weight < -0.1:
                sig.direction = 'SHORT'
        elif sig.sentiment_weight > 0.30:
            sig.direction = 'LONG'
        elif sig.sentiment_weight < -0.30:
            sig.direction = 'SHORT'

        # Update flow tracker
        self.update_flow(asset_type, sig.sentiment_weight)

        # Cache
        self._signal_cache[symbol] = sig
        return sig

    def get_rotation_alert(self) -> dict:
        """Public accessor for rotation events — read by the engine."""
        return self._rotation_signal()
