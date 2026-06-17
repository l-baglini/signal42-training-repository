"""Group ranked candidates into distinct findings and decide what's new.

Three stages (ARCHITECTURE.md §8):
  1. cheap deterministic pre-cluster (pure, testable)
  2. Claude judge (cheap model) merges/splits/names findings
  3. new-vs-covered decision against existing findings (pure, testable)

The pure stages (slugify, pre_cluster, decide_novelty) are the unit-test targets
(CLAUDE.md §10). The LLM call is injected so detect() is testable with a stub.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

from app.config import Settings
from app.domain import FindingPlan, RankedSource
from app.llm import get_client
from app.logging import get_logger
from app.prompts import CLUSTER_SYSTEM_PROMPT

log = get_logger(__name__)

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(title: str) -> str:
    """Stable, normalized cross-run identity key for a finding title."""
    slug = _SLUG_RE.sub("-", title.strip().lower()).strip("-")
    return slug or "untitled"


@dataclass
class ExistingFinding:
    finding_id: str
    slug: str
    source_urls: set[str]  # normalized URLs already attached


@dataclass
class ClusterDraft:
    """An LLM- or rule-proposed grouping before the novelty decision."""

    title: str
    sources: list[RankedSource] = field(default_factory=list)


# --- Stage 1: cheap deterministic pre-cluster -------------------------------

_STOP = {
    "the", "a", "an", "for", "and", "to", "of", "in", "on", "with", "new",
    "release", "notes", "changelog", "announcement", "paper", "arxiv", "blog",
}


def _title_tokens(title: str | None) -> frozenset[str]:
    if not title:
        return frozenset()
    toks = _SLUG_RE.sub(" ", title.lower()).split()
    return frozenset(t for t in toks if t not in _STOP and len(t) > 2)


def pre_cluster(ranked: list[RankedSource]) -> list[ClusterDraft]:
    """Group by overlapping significant title tokens. Deterministic and pure.

    Greedy: each source joins the first existing cluster it shares >=2 tokens
    with (or >=1 for short titles), else starts its own. Catches the obvious
    "several articles about the same thing" case before spending LLM tokens.
    """
    drafts: list[tuple[frozenset[str], ClusterDraft]] = []
    for src in ranked:
        toks = _title_tokens(src.candidate.title)
        placed = False
        for keyset, draft in drafts:
            overlap = len(toks & keyset)
            threshold = 1 if min(len(toks), len(keyset)) <= 2 else 2
            if toks and overlap >= threshold:
                draft.sources.append(src)
                placed = True
                break
        if not placed:
            title = src.candidate.title or src.candidate.url
            drafts.append((toks, ClusterDraft(title=title, sources=[src])))
    return [d for _, d in drafts]


# --- Stage 2: Claude judge --------------------------------------------------

_EMIT_TOOL = {
    "name": "emit_findings",
    "description": "Return the distinct findings grouped from the candidate list.",
    "input_schema": {
        "type": "object",
        "properties": {
            "findings": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string", "description": "Short, specific name of the development"},
                        "member_indices": {
                            "type": "array",
                            "items": {"type": "integer"},
                            "description": "Indices of candidate sources that belong to this finding",
                        },
                    },
                    "required": ["title", "member_indices"],
                },
            }
        },
        "required": ["findings"],
    },
}


def _candidate_block(ranked: list[RankedSource]) -> str:
    lines = []
    for i, src in enumerate(ranked):
        title = src.candidate.title or "(untitled)"
        snippet = (src.candidate.snippet or "")[:200].replace("\n", " ")
        lines.append(f"[{i}] {title}\n    {src.candidate.url}\n    {snippet}")
    return "\n".join(lines)


async def _llm_cluster(
    topic: str, ranked: list[RankedSource], settings: Settings
) -> list[ClusterDraft]:
    """Ask the cheap model to merge/split/name findings. Falls back to pre_cluster
    on any error (the run must not die because clustering hiccuped)."""
    client = get_client()
    block = _candidate_block(ranked)
    try:
        resp = await client.messages.create(
            model=settings.cluster_model,
            max_tokens=2000,
            system=CLUSTER_SYSTEM_PROMPT,
            tools=[_EMIT_TOOL],
            tool_choice={"type": "tool", "name": "emit_findings"},
            messages=[
                {
                    "role": "user",
                    "content": f"Topic: {topic}\n\nCandidates:\n{block}",
                }
            ],
        )
    except Exception as exc:  # noqa: BLE001
        log.warning("llm_cluster_failed", topic=topic, error=str(exc))
        return pre_cluster(ranked)

    tool_use = next((b for b in resp.content if b.type == "tool_use"), None)
    if tool_use is None:
        # Genuine failure (no tool call) — fall back to the deterministic grouping.
        return pre_cluster(ranked)

    # An empty findings list is a VALID result (every candidate was off-topic);
    # respect it rather than re-adding everything via pre_cluster.
    drafts: list[ClusterDraft] = []
    for f in tool_use.input.get("findings", []):
        members = [ranked[i] for i in f.get("member_indices", []) if 0 <= i < len(ranked)]
        if members:
            drafts.append(
                ClusterDraft(
                    title=f.get("title", "").strip() or members[0].candidate.url, sources=members
                )
            )
    return drafts


# --- Stage 3: new-vs-covered decision (pure) --------------------------------


def decide_novelty(
    drafts: list[ClusterDraft],
    existing: list[ExistingFinding],
    *,
    material_change_threshold: int,
) -> list[FindingPlan]:
    """Decide new | updated | skip for each draft. Pure and unit-testable.

    - slug not seen before        -> new
    - slug seen, >= N new URLs     -> updated (regenerate, version the digest)
    - slug seen, < N new URLs      -> skip (don't regenerate; CLAUDE.md §7)
    """
    by_slug = {e.slug: e for e in existing}
    plans: list[FindingPlan] = []
    for draft in drafts:
        slug = slugify(draft.title)
        urls = {s.normalized_url for s in draft.sources}
        prior = by_slug.get(slug)
        if prior is None:
            plans.append(FindingPlan(title=draft.title, slug=slug, sources=draft.sources, decision="new"))
            continue
        new_urls = urls - prior.source_urls
        if len(new_urls) >= material_change_threshold:
            plans.append(
                FindingPlan(
                    title=draft.title,
                    slug=slug,
                    sources=draft.sources,
                    decision="updated",
                    existing_finding_id=prior.finding_id,
                )
            )
        else:
            plans.append(
                FindingPlan(
                    title=draft.title,
                    slug=slug,
                    sources=draft.sources,
                    decision="skip",
                    existing_finding_id=prior.finding_id,
                )
            )
    return plans


# --- Orchestration ----------------------------------------------------------

ClusterFn = Callable[[str, list[RankedSource], Settings], Awaitable[list[ClusterDraft]]]


async def detect(
    topic: str,
    ranked: list[RankedSource],
    existing: list[ExistingFinding],
    settings: Settings,
    *,
    cluster_fn: ClusterFn | None = None,
) -> list[FindingPlan]:
    """Full pipeline stage: cluster ranked candidates, then decide novelty."""
    if not ranked:
        return []
    cluster_fn = cluster_fn or _llm_cluster
    drafts = await cluster_fn(topic, ranked, settings)
    plans = decide_novelty(
        drafts, existing, material_change_threshold=settings.material_change_threshold
    )
    log.info(
        "finding_detection_done",
        topic=topic,
        drafts=len(drafts),
        new=sum(p.decision == "new" for p in plans),
        updated=sum(p.decision == "updated" for p in plans),
        skip=sum(p.decision == "skip" for p in plans),
    )
    return plans
