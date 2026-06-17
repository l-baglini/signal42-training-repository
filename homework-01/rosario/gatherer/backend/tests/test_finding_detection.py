"""Unit tests for finding_detection — slug, pre-cluster, and the new/updated/skip
decision (CLAUDE.md §10)."""

from __future__ import annotations

import pytest

from app.domain import CandidateSource, RankedSource
from app.modules import finding_detection as fd
from tests.conftest import make_settings


def _ranked(title: str, url: str) -> RankedSource:
    return RankedSource(
        candidate=CandidateSource(url=url, title=title),
        normalized_url=url,
        authority=0.5,
        recency=0.5,
        score=0.5,
    )


def test_slugify_stable_and_normalized():
    assert fd.slugify("DataFusion Comet!") == "datafusion-comet"
    assert fd.slugify("  Apache  Gluten  ") == "apache-gluten"
    assert fd.slugify("") == "untitled"


def test_pre_cluster_groups_shared_title_tokens():
    ranked = [
        _ranked("DataFusion Comet 1.0 released", "https://a/1"),
        _ranked("DataFusion Comet performance benchmarks", "https://a/2"),
        _ranked("Apache Gluten joins the foundation", "https://b/1"),
    ]
    drafts = fd.pre_cluster(ranked)
    titles = {len(d.sources) for d in drafts}
    # Comet items cluster together (2), Gluten stands alone (1)
    assert sorted(len(d.sources) for d in drafts) == [1, 2]
    assert titles == {1, 2}


def test_decide_novelty_new_when_slug_unseen():
    drafts = [fd.ClusterDraft(title="DataFusion Comet", sources=[_ranked("x", "https://a/1")])]
    plans = fd.decide_novelty(drafts, existing=[], material_change_threshold=2)
    assert len(plans) == 1
    assert plans[0].decision == "new"
    assert plans[0].slug == "datafusion-comet"


def test_decide_novelty_updated_when_enough_new_urls():
    existing = [
        fd.ExistingFinding(finding_id="fid", slug="datafusion-comet", source_urls={"https://a/1"})
    ]
    drafts = [
        fd.ClusterDraft(
            title="DataFusion Comet",
            sources=[_ranked("x", "https://a/1"), _ranked("y", "https://a/2"), _ranked("z", "https://a/3")],
        )
    ]
    plans = fd.decide_novelty(drafts, existing, material_change_threshold=2)
    assert plans[0].decision == "updated"
    assert plans[0].existing_finding_id == "fid"


def test_decide_novelty_skip_when_not_enough_new_urls():
    existing = [
        fd.ExistingFinding(
            finding_id="fid", slug="datafusion-comet", source_urls={"https://a/1", "https://a/2"}
        )
    ]
    drafts = [
        fd.ClusterDraft(
            title="DataFusion Comet",
            sources=[_ranked("x", "https://a/1"), _ranked("y", "https://a/2"), _ranked("z", "https://a/3")],
        )
    ]
    plans = fd.decide_novelty(drafts, existing, material_change_threshold=2)
    # only 1 new url (a/3) < threshold 2 => skip
    assert plans[0].decision == "skip"


@pytest.mark.asyncio
async def test_detect_respects_empty_clusters():
    # When the clustering pass deems everything off-topic (empty), detect must
    # produce NO findings — not silently re-add the candidates.
    async def empty_cluster(topic, ranked, settings):
        return []

    ranked = [_ranked("Spark View Remote Access", "https://sparkview.example/notes")]
    plans = await fd.detect("spark", ranked, [], make_settings(), cluster_fn=empty_cluster)
    assert plans == []


@pytest.mark.asyncio
async def test_detect_passes_clusters_through_to_novelty():
    async def one_cluster(topic, ranked, settings):
        return [fd.ClusterDraft(title="DataFusion Comet", sources=ranked)]

    ranked = [_ranked("DataFusion Comet 1.0", "https://a/1")]
    plans = await fd.detect("spark", ranked, [], make_settings(), cluster_fn=one_cluster)
    assert len(plans) == 1
    assert plans[0].decision == "new"
    assert plans[0].slug == "datafusion-comet"
