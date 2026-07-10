"""Retrieve + extract readable text and images from URLs.

Bounded-concurrency async download (httpx) + trafilatura extraction. A flaky or
slow source is logged and skipped — it never crashes the topic run (CLAUDE.md §10).
"""

from __future__ import annotations

import asyncio
import json
from dataclasses import dataclass, field
from datetime import datetime

import httpx
import trafilatura
from dateutil import parser as dateparser

from app.config import Settings
from app.domain import CandidateSource
from app.logging import get_logger

log = get_logger(__name__)

_UA = "gatherer-tech-radar/0.1 (+https://github.com/local/gatherer)"


@dataclass
class ExtractedDoc:
    text: str | None = None
    title: str | None = None
    author: str | None = None
    published_at: datetime | None = None
    image_urls: list[str] = field(default_factory=list)


def _extract_html(html: str, url: str) -> ExtractedDoc:
    """Run trafilatura on already-downloaded HTML. CPU-bound; call in a thread."""
    raw = trafilatura.extract(
        html,
        url=url,
        output_format="json",
        with_metadata=True,
        include_images=True,
        favor_precision=True,
    )
    if not raw:
        return ExtractedDoc()
    data = json.loads(raw)
    published = None
    if data.get("date"):
        try:
            published = dateparser.parse(data["date"])
        except (ValueError, OverflowError, TypeError):
            published = None
    images = []
    if data.get("image"):
        images.append(data["image"])
    return ExtractedDoc(
        text=data.get("text") or data.get("raw_text"),
        title=data.get("title"),
        author=data.get("author"),
        published_at=published,
        image_urls=images,
    )


async def fetch_extract(url: str, client: httpx.AsyncClient) -> ExtractedDoc | None:
    """Download one URL and extract its readable content. Returns None on failure."""
    try:
        resp = await client.get(url)
        resp.raise_for_status()
    except (httpx.HTTPError, httpx.InvalidURL) as exc:
        log.warning("fetch_failed", url=url, error=str(exc))
        return None
    try:
        # trafilatura is synchronous/CPU-bound — keep it off the event loop.
        return await asyncio.to_thread(_extract_html, resp.text, url)
    except Exception as exc:  # noqa: BLE001 — extraction must never crash a run
        log.warning("extract_failed", url=url, error=str(exc))
        return None


async def enrich(candidates: list[CandidateSource], settings: Settings) -> list[CandidateSource]:
    """Fill missing body text / images / byline for candidates the search API did
    not already extract. Mutates and returns the same list.
    """
    needs_fetch = [c for c in candidates if not (c.raw_content and c.raw_content.strip())]
    if not needs_fetch:
        return candidates

    limits = httpx.Limits(
        max_connections=settings.fetch_concurrency,
        max_keepalive_connections=settings.fetch_concurrency,
    )
    timeout = httpx.Timeout(settings.fetch_timeout_seconds, connect=5.0)
    sem = asyncio.Semaphore(settings.fetch_concurrency)

    async with httpx.AsyncClient(
        limits=limits, timeout=timeout, follow_redirects=True, headers={"User-Agent": _UA}
    ) as client:

        async def _one(cand: CandidateSource) -> None:
            async with sem:
                doc = await fetch_extract(cand.url, client)
            if doc is None:
                return
            if doc.text:
                cand.raw_content = doc.text
            if doc.title and not cand.title:
                cand.title = doc.title
            if doc.published_at and not cand.published_at:
                cand.published_at = doc.published_at
            if doc.author:
                cand.has_byline = True
            for img in doc.image_urls:
                if img not in cand.image_urls:
                    cand.image_urls.append(img)

        # return_exceptions=True so an unexpected error in any single task never
        # crashes the whole topic run (CLAUDE.md §10).
        gathered = await asyncio.gather(*(_one(c) for c in needs_fetch), return_exceptions=True)
        for res in gathered:
            if isinstance(res, Exception):
                log.warning("enrich_task_error", error=str(res))

    enriched = sum(1 for c in needs_fetch if c.raw_content)
    log.info("fetch_done", attempted=len(needs_fetch), enriched=enriched)
    return candidates
