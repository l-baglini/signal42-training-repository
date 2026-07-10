"""News fetching from GDELT (keyless) and RSS feeds (keyless)."""
import asyncio
from datetime import datetime, timezone

import httpx
import feedparser

GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc"

# Feed RSS affidabili e senza chiave. Aggiungine/togline a piacere.
RSS_FEEDS = {
    "BBC World": "http://feeds.bbci.co.uk/news/world/rss.xml",
    "Reuters World": "https://www.reutersagency.com/feed/?best-topics=top-news&post_type=best",
    "Al Jazeera": "https://www.aljazeera.com/xml/rss/all.xml",
    "The Guardian World": "https://www.theguardian.com/world/rss",
    "AP Top News": "https://rsshub.app/apnews/topics/apf-topnews",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def fetch_gdelt(query: str | None, max_records: int = 30) -> list[dict]:
    """Search recent news via GDELT. If query is None, pull general world news."""
    if query:
        q = query.strip()
        # GDELT richiede le virgolette per le frasi multi-parola, altrimenti
        # interpreta gli spazi come operatori e restituisce un errore (0 risultati).
        if " " in q:
            q = f'"{q}"'
    else:
        q = "sourcelang:english"
    params = {
        "query": q,
        "mode": "ArtList",
        "maxrecords": str(max_records),
        "format": "json",
        "sort": "DateDesc",
        "timespan": "3d",
    }
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(GDELT_URL, params=params)
        if resp.status_code != 200:
            return []
        # GDELT a volte risponde con testo non-JSON in caso di rate limit
        try:
            data = resp.json()
        except Exception:
            return []
    except Exception:
        return []

    out = []
    for a in data.get("articles", []):
        out.append({
            "title": a.get("title", "").strip(),
            "url": a.get("url", ""),
            "source": a.get("domain", "gdelt"),
            "published": a.get("seendate", ""),
            "summary": "",
        })
    return out


def _parse_one_feed(name: str, url: str) -> list[dict]:
    try:
        parsed = feedparser.parse(url)
    except Exception:
        return []
    items = []
    for e in parsed.entries[:20]:
        items.append({
            "title": getattr(e, "title", "").strip(),
            "url": getattr(e, "link", ""),
            "source": name,
            "published": getattr(e, "published", "") or getattr(e, "updated", ""),
            "summary": (getattr(e, "summary", "") or "")[:500],
        })
    return items


async def fetch_rss() -> list[dict]:
    """Fetch all RSS feeds concurrently (feedparser is sync, so run in threads)."""
    tasks = [asyncio.to_thread(_parse_one_feed, name, url)
             for name, url in RSS_FEEDS.items()]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    out = []
    for r in results:
        if isinstance(r, list):
            out.extend(r)
    return out


def dedup(articles: list[dict]) -> list[dict]:
    seen = set()
    out = []
    for a in articles:
        key = (a.get("url") or a.get("title", "")).strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(a)
    return out


async def fetch_news(topic: str | None = None) -> list[dict]:
    gdelt, rss = await asyncio.gather(fetch_gdelt(topic), fetch_rss())
    # Se c'è un topic, filtra anche gli RSS per keyword nel titolo/summary.
    # Match per token (tutte le parole presenti), non per frase contigua:
    # così "machine learning" trova titoli con le parole separate.
    if topic:
        tokens = [w for w in topic.lower().split() if w]
        if tokens:
            rss = [a for a in rss
                   if all(w in (a["title"] + " " + a["summary"]).lower() for w in tokens)]
    combined = dedup(gdelt + rss)
    return combined
