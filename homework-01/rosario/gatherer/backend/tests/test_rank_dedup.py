"""Unit tests for rank_dedup — pure ranking/dedup logic (CLAUDE.md §10)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain import CandidateSource, DomainClass
from app.modules import rank_dedup as rd


def test_normalize_url_strips_www_tracking_and_trailing_slash():
    a = rd.normalize_url("https://www.Example.com/Path/?utm_source=x&b=2#frag")
    b = rd.normalize_url("https://example.com/Path?b=2")
    assert a == b
    assert "utm_source" not in a
    assert not a.endswith("/")


def test_normalize_url_is_idempotent():
    once = rd.normalize_url("http://www.foo.com/a/b/")
    assert rd.normalize_url(once) == once


def test_classify_domain_known_and_subdomain():
    assert rd.classify_domain("https://github.com/x/y/releases") is DomainClass.GITHUB_RELEASE
    assert rd.classify_domain("https://arxiv.org/abs/1234") is DomainClass.ARXIV
    assert rd.classify_domain("https://spark.apache.org/news") is DomainClass.OFFICIAL
    assert rd.classify_domain("https://random-blog.example/post") is DomainClass.UNKNOWN


def test_authority_official_beats_unknown():
    official = CandidateSource(url="https://kubernetes.io/blog/x", domain_class=DomainClass.OFFICIAL)
    unknown = CandidateSource(url="https://nobody.example/x", domain_class=DomainClass.UNKNOWN)
    assert rd.authority_score(official) > rd.authority_score(unknown)


def test_recency_decay_and_missing_date():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    fresh = rd.recency_score(now, now=now, half_life_days=14)
    old = rd.recency_score(now - timedelta(days=28), now=now, half_life_days=14)
    assert fresh > old
    # one half-life => ~0.5
    half = rd.recency_score(now - timedelta(days=14), now=now, half_life_days=14)
    assert abs(half - 0.5) < 0.02
    # missing date => neutral-low
    assert rd.recency_score(None) == 0.3


def test_rank_dedups_by_normalized_url_keeping_higher_score():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    cands = [
        CandidateSource(url="https://www.example.com/a/?utm_x=1", title="dup low",
                        domain_class=DomainClass.UNKNOWN, published_at=now - timedelta(days=40)),
        CandidateSource(url="https://example.com/a", title="dup high",
                        domain_class=DomainClass.OFFICIAL, published_at=now),
    ]
    ranked = rd.rank(cands, now=now)
    assert len(ranked) == 1  # deduped
    assert ranked[0].candidate.title == "dup high"  # kept the higher-scoring one


def test_rank_orders_authority_floor_over_recency():
    now = datetime(2026, 6, 16, tzinfo=timezone.utc)
    stale_official = CandidateSource(
        url="https://kubernetes.io/notes", domain_class=DomainClass.OFFICIAL,
        published_at=now - timedelta(days=10),
    )
    fresh_aggregator = CandidateSource(
        url="https://news.ycombinator.com/item", domain_class=DomainClass.AGGREGATOR,
        published_at=now,
    )
    ranked = rd.rank([fresh_aggregator, stale_official], now=now,
                     authority_weight=0.6, recency_weight=0.4)
    # high authority should not be fully overridden by a fresh low-authority source
    assert ranked[0].candidate.url == "https://kubernetes.io/notes"
