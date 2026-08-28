"""arXiv paper fetching via the public Atom API (keyless)."""
import asyncio

import httpx
import feedparser

ARXIV_URL = "https://export.arxiv.org/api/query"

# Mappa di comodo: topic -> categoria arXiv (per la modalità "paper watch").
TOPIC_CATEGORIES = {
    "nlp": "cs.CL",
    "machine learning": "cs.LG",
    "computer vision": "cs.CV",
    "ai": "cs.AI",
    "robotics": "cs.RO",
    "information retrieval": "cs.IR",
    "statistics ml": "stat.ML",
}


def _parse_arxiv(text: str) -> list[dict]:
    parsed = feedparser.parse(text)
    out = []
    for e in parsed.entries:
        authors = [a.get("name", "") for a in getattr(e, "authors", [])]
        out.append({
            "id": getattr(e, "id", ""),
            "title": getattr(e, "title", "").replace("\n", " ").strip(),
            "authors": authors,
            "summary": getattr(e, "summary", "").replace("\n", " ").strip(),
            "published": getattr(e, "published", ""),
            "updated": getattr(e, "updated", ""),
            "url": getattr(e, "link", ""),
        })
    return out


async def _query(params: dict) -> list[dict]:
    try:
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.get(ARXIV_URL, params=params)
        if resp.status_code != 200:
            return []
        return _parse_arxiv(resp.text)
    except Exception:
        return []


async def latest_by_topic(topic: str, max_results: int = 15) -> list[dict]:
    """Newest papers for a topic. Uses a known category if available, else keyword search."""
    cat = TOPIC_CATEGORIES.get(topic.lower().strip())
    if cat:
        search = f"cat:{cat}"
    else:
        # Niente virgolette: la frase esatta è troppo restrittiva. Senza
        # virgolette arXiv mette i termini in AND -> match più ampio.
        search = f"all:{topic}"
    params = {
        "search_query": search,
        "sortBy": "submittedDate",
        "sortOrder": "descending",
        "max_results": str(max_results),
    }
    return await _query(params)


async def search_relevant(topic: str, max_results: int = 10) -> list[dict]:
    """Most relevant papers for a topic (for the state-of-the-art report)."""
    params = {
        "search_query": f"all:{topic}",
        "sortBy": "relevance",
        "sortOrder": "descending",
        "max_results": str(max_results),
    }
    return await _query(params)
