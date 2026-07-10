"""Rank candidate sources by authority + recency, and de-duplicate.

Pure functions only — no I/O, no DB, no network. This is a unit-test target
(CLAUDE.md §10). See ARCHITECTURE.md §7 for the scoring rationale.
"""

from __future__ import annotations

import math
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

from app.domain import (
    AUTHORITY_BASE,
    CandidateSource,
    DomainClass,
    RankedSource,
)

# Curated, extensible domain -> class map. Unknown domains fall to UNKNOWN (low),
# so random blogs are never over-trusted.
DOMAIN_CLASS_MAP: dict[str, DomainClass] = {
    "github.com": DomainClass.GITHUB_RELEASE,
    "arxiv.org": DomainClass.ARXIV,
    # official docs / projects
    "kubernetes.io": DomainClass.OFFICIAL,
    "spark.apache.org": DomainClass.OFFICIAL,
    "go.dev": DomainClass.OFFICIAL,
    "golang.org": DomainClass.OFFICIAL,
    "python.org": DomainClass.OFFICIAL,
    "docs.rs": DomainClass.OFFICIAL,
    # reputable engineering blogs / aggregators
    "cloud.google.com": DomainClass.ENG_BLOG,
    "aws.amazon.com": DomainClass.ENG_BLOG,
    "engineering.fb.com": DomainClass.ENG_BLOG,
    "netflixtechblog.com": DomainClass.ENG_BLOG,
    "infoq.com": DomainClass.AGGREGATOR,
    "thenewstack.io": DomainClass.AGGREGATOR,
    "news.ycombinator.com": DomainClass.AGGREGATOR,
    "medium.com": DomainClass.AGGREGATOR,
    "dev.to": DomainClass.AGGREGATOR,
}

_TRACKING_PREFIXES = ("utm_", "ref", "fbclid", "gclid", "mc_")


def normalize_url(url: str) -> str:
    """Canonicalize a URL for dedup: lowercase host, strip www/fragment/tracking,
    drop trailing slash. Deterministic and idempotent."""
    parts = urlsplit(url.strip())
    scheme = (parts.scheme or "https").lower()
    host = parts.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    # strip tracking query params, keep the rest sorted for stability
    kept = []
    for pair in parts.query.split("&"):
        if not pair:
            continue
        key = pair.split("=", 1)[0].lower()
        if any(key.startswith(p) for p in _TRACKING_PREFIXES):
            continue
        kept.append(pair)
    query = "&".join(sorted(kept))
    path = parts.path.rstrip("/") or "/"
    return urlunsplit((scheme, host, path, query, ""))


def classify_domain(url: str) -> DomainClass:
    """Map a URL to a DomainClass via suffix match against the curated map."""
    host = urlsplit(url).netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    if host in DOMAIN_CLASS_MAP:
        return DOMAIN_CLASS_MAP[host]
    # suffix match (e.g. "releases.k8s.io" under "kubernetes.io" won't match, but
    # "foo.github.com" should still count as github)
    for domain, cls in DOMAIN_CLASS_MAP.items():
        if host == domain or host.endswith("." + domain):
            return cls
    return DomainClass.UNKNOWN


def authority_score(candidate: CandidateSource) -> float:
    """Base by domain class + small signal bonuses, clamped to [0, 1]."""
    cls = candidate.domain_class
    if cls is DomainClass.UNKNOWN:
        cls = classify_domain(candidate.url)
    base = AUTHORITY_BASE[cls]
    bonus = 0.0
    if candidate.url.lower().startswith("https://"):
        bonus += 0.02
    if candidate.has_byline:
        bonus += 0.03
    return max(0.0, min(1.0, base + bonus))


def recency_score(
    published_at: datetime | None,
    *,
    now: datetime | None = None,
    half_life_days: float = 14.0,
) -> float:
    """Exponential decay on age. Missing date -> neutral-low (0.3)."""
    if published_at is None:
        return 0.3
    now = now or datetime.now(timezone.utc)
    if published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    age_days = max(0.0, (now - published_at).total_seconds() / 86400.0)
    return math.exp(-math.log(2) * age_days / half_life_days)


def rank(
    candidates: list[CandidateSource],
    *,
    authority_weight: float = 0.6,
    recency_weight: float = 0.4,
    half_life_days: float = 14.0,
    now: datetime | None = None,
) -> list[RankedSource]:
    """De-duplicate by normalized URL (keep first / most authoritative on tie),
    score each, and return sorted by descending final score.

    Recency cannot fully override low authority because authority_weight pins a
    floor proportional to the source's domain class.
    """
    best: dict[str, RankedSource] = {}
    for cand in candidates:
        norm = normalize_url(cand.url)
        auth = authority_score(cand)
        rec = recency_score(cand.published_at, now=now, half_life_days=half_life_days)
        score = authority_weight * auth + recency_weight * rec
        ranked = RankedSource(
            candidate=cand, normalized_url=norm, authority=auth, recency=rec, score=score
        )
        existing = best.get(norm)
        # On dup, keep the one with the higher score (more authoritative/recent).
        if existing is None or ranked.score > existing.score:
            best[norm] = ranked

    return sorted(best.values(), key=lambda r: r.score, reverse=True)
