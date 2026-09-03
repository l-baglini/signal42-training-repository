"""Plain data structures passed between pipeline modules.

Kept ORM-free so the pure modules (rank_dedup, finding_detection) and the agent
stay independently testable without a database.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum


class DomainClass(str, Enum):
    OFFICIAL = "official"          # official docs / release notes
    GITHUB_RELEASE = "github_release"
    ARXIV = "arxiv"
    MAINTAINER_BLOG = "maintainer_blog"
    ENG_BLOG = "reputable_eng_blog"
    AGGREGATOR = "aggregator"      # news / aggregators
    UNKNOWN = "unknown"


# Base authority by domain class (CLAUDE.md §7: authoritative-first).
AUTHORITY_BASE: dict[DomainClass, float] = {
    DomainClass.OFFICIAL: 1.0,
    DomainClass.GITHUB_RELEASE: 0.95,
    DomainClass.ARXIV: 0.90,
    DomainClass.MAINTAINER_BLOG: 0.80,
    DomainClass.ENG_BLOG: 0.60,
    DomainClass.AGGREGATOR: 0.40,
    DomainClass.UNKNOWN: 0.20,
}


@dataclass
class CandidateSource:
    """A discovered source before ranking. Output of source_discovery."""

    url: str
    title: str | None = None
    snippet: str | None = None
    published_at: datetime | None = None
    raw_content: str | None = None          # if the search API already extracted it
    image_urls: list[str] = field(default_factory=list)
    domain_class: DomainClass = DomainClass.UNKNOWN
    has_byline: bool = False


@dataclass
class RankedSource:
    """A candidate with computed scores. Output of rank_dedup."""

    candidate: CandidateSource
    normalized_url: str
    authority: float
    recency: float
    score: float


@dataclass
class FindingPlan:
    """A distinct finding to (maybe) digest. Output of finding_detection."""

    title: str
    slug: str
    sources: list[RankedSource]
    # decision: "new" | "updated" | "skip"
    decision: str = "new"
    existing_finding_id: str | None = None


@dataclass
class DigestSections:
    what_changed: str = ""
    why_it_matters: str = ""
    technical_details: str = ""
    sources_md: str = ""


@dataclass
class DigestResult:
    """Output of the ReAct agent for one finding."""

    sections: DigestSections
    body_md: str
    model: str
    cited_urls: list[str] = field(default_factory=list)
    hit_iteration_guard: bool = False
