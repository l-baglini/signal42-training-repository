"""Find candidate sources for a topic, authoritative-first (CLAUDE.md §8).

I/O + normalize only — no ranking, no summarizing. Uses Tavily for breadth and
targeted GitHub Releases / arXiv queries for high-authority structured sources.

A thin provider seam (TavilySearchProvider) keeps the search backend swappable.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Protocol

from dateutil import parser as dateparser
from tavily import AsyncTavilyClient

from app.config import Settings
from app.domain import CandidateSource
from app.logging import get_logger
from app.modules.rank_dedup import classify_domain

log = get_logger(__name__)


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return dateparser.parse(value)
    except (ValueError, OverflowError, TypeError):
        return None


class SearchProvider(Protocol):
    async def search(self, query: str, *, max_results: int) -> list[CandidateSource]: ...


@dataclass
class TavilySearchProvider:
    """Tavily-backed search. Returns ranked results plus extracted page text and
    image candidates in a single call (include_raw_content / include_images)."""

    api_key: str

    def __post_init__(self) -> None:
        self._client = AsyncTavilyClient(api_key=self.api_key)

    async def search(self, query: str, *, max_results: int) -> list[CandidateSource]:
        resp = await self._client.search(
            query=query,
            search_depth="advanced",
            time_range="month",          # recency window; works for any topic
            max_results=max_results,
            include_raw_content=True,    # cleaned page text — lets us skip a fetch
            include_images=True,
            include_image_descriptions=True,
        )
        results = resp.get("results", []) or []
        # Tavily returns images at the response level, not per-result; attach them
        # to the top result as candidate images for that finding cluster.
        top_images = [img.get("url") for img in (resp.get("images") or []) if img.get("url")]

        candidates: list[CandidateSource] = []
        for i, r in enumerate(results):
            url = r.get("url")
            if not url:
                continue
            candidates.append(
                CandidateSource(
                    url=url,
                    title=r.get("title"),
                    snippet=r.get("content"),
                    published_at=_parse_date(r.get("published_date")),
                    raw_content=r.get("raw_content"),
                    image_urls=top_images if i == 0 else [],
                    domain_class=classify_domain(url),
                )
            )
        return candidates


# Query templates biased toward authoritative, dated material.
_QUERY_TEMPLATES = (
    "{topic} release notes",
    "{topic} changelog",
    "{topic} announcement",
    "{topic} new release",
    "{topic} arxiv paper",
)


async def discover(
    topic: str,
    settings: Settings,
    *,
    provider: SearchProvider | None = None,
) -> list[CandidateSource]:
    """Run the query set for a topic and return normalized candidates.

    Errors from any single query are isolated and logged — one bad query must not
    sink the whole run (CLAUDE.md §10).
    """
    provider = provider or TavilySearchProvider(api_key=settings.tavily_api_key)
    per_query = max(3, settings.max_candidates_per_topic // len(_QUERY_TEMPLATES))

    seen_urls: set[str] = set()
    candidates: list[CandidateSource] = []
    for template in _QUERY_TEMPLATES:
        query = template.format(topic=topic)
        try:
            results = await provider.search(query, max_results=per_query)
        except Exception as exc:  # noqa: BLE001 — isolate flaky search calls
            log.warning("search_query_failed", query=query, error=str(exc))
            continue
        for cand in results:
            if cand.url in seen_urls:
                continue
            seen_urls.add(cand.url)
            candidates.append(cand)
        if len(candidates) >= settings.max_candidates_per_topic:
            break

    log.info("discovery_done", topic=topic, candidates=len(candidates))
    return candidates[: settings.max_candidates_per_topic]
