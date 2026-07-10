"""Unit tests for the ReAct agent loop control + stopping logic (CLAUDE.md §10).

The Anthropic client is faked so the loop is exercised with no network access.
"""

from __future__ import annotations

import pytest

from app.domain import CandidateSource, FindingPlan, RankedSource
from app.modules.agent import DigestAgent
from tests.conftest import make_settings


class _Block:
    def __init__(self, type, name=None, id=None, input=None, text=None):
        self.type = type
        self.name = name
        self.id = id
        self.input = input or {}
        self.text = text


class _Resp:
    def __init__(self, content, stop_reason):
        self.content = content
        self.stop_reason = stop_reason


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    async def create(self, **kwargs):
        resp = self._responses[min(self.calls, len(self._responses) - 1)]
        self.calls += 1
        return resp


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


class _ForcingFakeMessages:
    """Returns write_digest only when the caller forces the tool (final/over-budget
    turn); otherwise returns an unknown tool so the loop keeps going."""

    def __init__(self):
        self.calls = 0

    async def create(self, **kwargs):
        self.calls += 1
        if kwargs.get("tool_choice", {}).get("type") == "tool":
            write = _Block(
                "tool_use",
                name="write_digest",
                id=f"w{self.calls}",
                input={
                    "what_changed": "forced-WC",
                    "why_it_matters": "forced-WM",
                    "technical_details": "forced-TD",
                    "sources": "1. Comet — https://x/1",
                },
            )
            return _Resp([write], "tool_use")
        return _Resp([_Block("tool_use", name="noop", id=f"n{self.calls}", input={})], "tool_use")


class _ForcingClient:
    def __init__(self):
        self.messages = _ForcingFakeMessages()


def _plan() -> FindingPlan:
    src = RankedSource(
        candidate=CandidateSource(url="https://x/1", title="Comet", raw_content="body"),
        normalized_url="https://x/1",
        authority=0.9,
        recency=0.8,
        score=0.85,
    )
    return FindingPlan(title="DataFusion Comet", slug="datafusion-comet", sources=[src], decision="new")


@pytest.mark.asyncio
async def test_agent_finishes_on_write_digest():
    write = _Block(
        "tool_use",
        name="write_digest",
        id="t1",
        input={
            "what_changed": "WC",
            "why_it_matters": "WM",
            "technical_details": "TD",
            "sources": "1. Comet — https://x/1",
        },
    )
    client = _FakeClient([_Resp([write], "tool_use")])
    agent = DigestAgent(make_settings(agent_max_iterations=3), client=client)

    result = await agent.run("Spark", _plan())

    assert result.hit_iteration_guard is False
    assert result.sections.what_changed == "WC"
    assert result.sections.why_it_matters == "WM"
    assert "https://x/1" in result.cited_urls
    assert client.messages.calls == 1


@pytest.mark.asyncio
async def test_agent_hits_iteration_guard_and_degrades_gracefully():
    # A tool the agent doesn't know -> observation is "Unknown tool", loop continues
    # until the guard trips. No exception, returns a best-effort digest.
    noop = _Block("tool_use", name="noop", id="n1", input={})
    client = _FakeClient([_Resp([noop], "tool_use")])
    agent = DigestAgent(make_settings(agent_max_iterations=2), client=client)

    result = await agent.run("Spark", _plan())

    assert result.hit_iteration_guard is True
    assert client.messages.calls == 2  # exactly max_iterations calls, then degrade
    assert result.body_md  # still produced something


@pytest.mark.asyncio
async def test_agent_forces_real_digest_on_final_turn():
    # Model keeps calling tools and never writes on its own; the final turn forces
    # write_digest, so we get a REAL digest (not the empty fallback).
    client = _ForcingClient()
    agent = DigestAgent(make_settings(agent_max_iterations=3, agent_token_budget=10_000_000), client=client)

    result = await agent.run("Spark", _plan())

    assert result.hit_iteration_guard is False  # not the degraded placeholder
    assert result.sections.what_changed == "forced-WC"
    assert client.messages.calls == 3  # forced on the last allowed turn


@pytest.mark.asyncio
async def test_agent_forces_write_when_token_budget_exceeded():
    # Budget 0 => the very first turn is forced, capping token spend immediately.
    client = _ForcingClient()
    agent = DigestAgent(make_settings(agent_max_iterations=6, agent_token_budget=0), client=client)

    result = await agent.run("Spark", _plan())

    assert result.hit_iteration_guard is False
    assert result.sections.what_changed == "forced-WC"
    assert client.messages.calls == 1  # forced on turn 0, no wasted iterations


@pytest.mark.asyncio
async def test_agent_nudges_when_model_ends_without_write_digest():
    # First turn: model ends (end_turn) without write_digest -> agent nudges once.
    # Second turn: model emits write_digest -> finishes.
    text = _Block("text", text="here is a digest in prose")
    write = _Block(
        "tool_use",
        name="write_digest",
        id="t1",
        input={"what_changed": "x", "why_it_matters": "y", "technical_details": "z", "sources": ""},
    )
    client = _FakeClient([_Resp([text], "end_turn"), _Resp([write], "tool_use")])
    agent = DigestAgent(make_settings(agent_max_iterations=4), client=client)

    result = await agent.run("Spark", _plan())

    assert result.hit_iteration_guard is False
    assert client.messages.calls == 2
