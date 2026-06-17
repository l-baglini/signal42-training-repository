"""The digest-producing ReAct agent (CLAUDE.md §6).

Thought -> Action -> Observation loop with Claude tool use. The model searches /
fetches to verify, then emits the digest via the `write_digest` tool. A mandatory
max-iteration guard bounds token spend; hitting it degrades gracefully (writes the
best digest available, logs it, never crashes).

The loop control + stopping logic is a unit-test target (CLAUDE.md §10); the
Anthropic client and tool executors are injectable so the loop is testable
without network access.
"""

from __future__ import annotations

import re
from collections.abc import Awaitable, Callable

import httpx

from app.config import Settings
from app.domain import DigestResult, DigestSections, FindingPlan
from app.llm import get_client
from app.logging import get_logger
from app.modules.fetch import fetch_extract
from app.modules.source_discovery import TavilySearchProvider
from app.prompts import DIGEST_SYSTEM_PROMPT, DIGEST_TASK_TEMPLATE

log = get_logger(__name__)

_URL_RE = re.compile(r"https?://[^\s\)\]]+")

# --- Tool schemas exposed to the agent --------------------------------------

TOOLS = [
    {
        "name": "web_search",
        "description": "Search the web for sources to fill gaps or verify a claim.",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"],
        },
    },
    {
        "name": "fetch_page",
        "description": "Fetch and extract the readable text of a specific URL to verify it.",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"],
        },
    },
    {
        "name": "write_digest",
        "description": "Emit the final digest for this finding. Call exactly once when ready.",
        "input_schema": {
            "type": "object",
            "properties": {
                "what_changed": {"type": "string"},
                "why_it_matters": {"type": "string"},
                "technical_details": {"type": "string"},
                "sources": {
                    "type": "string",
                    "description": "Numbered list of 'title — URL' for each [n] cited.",
                },
            },
            "required": ["what_changed", "why_it_matters", "technical_details", "sources"],
        },
    },
]

# A tool executor maps a tool input dict to an observation string.
ToolExecutor = Callable[[dict], Awaitable[str]]


def _usage_tokens(resp) -> int:
    """Cost-representative token count for one response: input + output + cache.
    output_tokens already includes thinking tokens, so we do NOT add those."""
    u = getattr(resp, "usage", None)
    if u is None:
        return 0
    fields = (
        "input_tokens",
        "output_tokens",
        "cache_read_input_tokens",
        "cache_creation_input_tokens",
    )
    return sum(int(getattr(u, f, 0) or 0) for f in fields)


def _sources_block(plan: FindingPlan, max_chars: int = 1500) -> str:
    lines = []
    for i, src in enumerate(plan.sources):
        c = src.candidate
        body = (c.raw_content or c.snippet or "").strip().replace("\n", " ")[:max_chars]
        lines.append(f"[{i}] {c.title or '(untitled)'}\n    {c.url}\n    {body}")
    return "\n".join(lines)


def _assemble_body(sections: DigestSections) -> str:
    return (
        f"## What changed\n{sections.what_changed}\n\n"
        f"## Why it matters\n{sections.why_it_matters}\n\n"
        f"## Technical details\n{sections.technical_details}\n\n"
        f"## Sources\n{sections.sources_md}\n"
    )


def _fallback_sections(plan: FindingPlan) -> DigestSections:
    """Best-effort digest when the iteration guard trips before write_digest."""
    srcs = "\n".join(
        f"{i + 1}. {s.candidate.title or s.candidate.url} — {s.candidate.url}"
        for i, s in enumerate(plan.sources)
    )
    return DigestSections(
        what_changed=f"Automated digest for '{plan.title}' could not be completed within the "
        "iteration budget. The ranked sources below were gathered but not fully synthesized.",
        why_it_matters="(incomplete — review the sources directly)",
        technical_details="(incomplete)",
        sources_md=srcs,
    )


class DigestAgent:
    def __init__(self, settings: Settings, *, client=None):
        self.settings = settings
        self.client = client or get_client()
        self._search = TavilySearchProvider(api_key=settings.tavily_api_key)

    async def _tool_web_search(self, args: dict) -> str:
        query = args.get("query", "")
        try:
            results = await self._search.search(query, max_results=5)
        except Exception as exc:  # noqa: BLE001
            return f"web_search error: {exc}"
        if not results:
            return "No results."
        return "\n".join(
            f"- {r.title or '(untitled)'} ({r.url})\n  {(r.snippet or '')[:300]}" for r in results
        )

    async def _tool_fetch_page(self, args: dict, http: httpx.AsyncClient) -> str:
        url = args.get("url", "")
        doc = await fetch_extract(url, http)
        if doc is None or not doc.text:
            return f"Could not extract content from {url}."
        head = doc.text[:6000]
        meta = f"title={doc.title!r} author={doc.author!r} date={doc.published_at}"
        return f"{meta}\n\n{head}"

    async def run(self, topic: str, plan: FindingPlan) -> DigestResult:
        # The HTTP client lives for exactly one run() call — keeps the agent
        # concurrency-safe if runs are ever parallelized.
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(self.settings.fetch_timeout_seconds, connect=5.0),
            follow_redirects=True,
            headers={"User-Agent": "gatherer-tech-radar/0.1"},
        ) as http:
            return await self._run(topic, plan, http)

    async def _run(self, topic: str, plan: FindingPlan, http: httpx.AsyncClient) -> DigestResult:
        executors: dict[str, ToolExecutor] = {
            "web_search": self._tool_web_search,
            "fetch_page": lambda args: self._tool_fetch_page(args, http),
        }
        messages: list[dict] = [
            {
                "role": "user",
                "content": DIGEST_TASK_TEMPLATE.format(
                    topic=topic,
                    finding_title=plan.title,
                    sources_block=_sources_block(plan),
                ),
            }
        ]

        tokens_used = 0
        budget = self.settings.agent_token_budget
        max_iter = self.settings.agent_max_iterations

        for iteration in range(max_iter):
            # Force a real digest on the last allowed turn, or once the per-finding
            # token budget is spent. Forcing a tool requires thinking OFF — the API
            # rejects forced tool_choice while extended thinking is enabled.
            force_write = iteration == max_iter - 1 or tokens_used >= budget
            create_kwargs: dict = dict(
                model=self.settings.digest_model,
                max_tokens=self.settings.agent_max_tokens,
                system=DIGEST_SYSTEM_PROMPT,
                tools=TOOLS,
                messages=messages,
            )
            if force_write:
                create_kwargs["tool_choice"] = {"type": "tool", "name": "write_digest"}
            else:
                create_kwargs["thinking"] = {"type": "adaptive"}

            resp = await self.client.messages.create(**create_kwargs)
            tokens_used += _usage_tokens(resp)

            tool_uses = [b for b in resp.content if b.type == "tool_use"]

            # Did the model finish by emitting the digest?
            write = next((b for b in tool_uses if b.name == "write_digest"), None)
            if write is not None:
                log.info(
                    "digest_written",
                    finding=plan.title,
                    iterations=iteration + 1,
                    tokens=tokens_used,
                    forced=force_write,
                )
                return self._finalize(write.input)

            # A truncated turn (thinking ate the per-turn ceiling) isn't usable —
            # skip it and let the next (eventually forced) turn write the digest.
            if resp.stop_reason == "max_tokens":
                log.warning("agent_turn_truncated", finding=plan.title, iteration=iteration)
                continue

            if resp.stop_reason != "tool_use":
                # Model ended without calling write_digest — nudge once.
                log.warning("agent_no_write_digest", finding=plan.title, iteration=iteration)
                messages.append({"role": "assistant", "content": resp.content})
                messages.append(
                    {
                        "role": "user",
                        "content": "Call the write_digest tool now with the four sections.",
                    }
                )
                continue

            # Execute requested tools, feed observations back.
            messages.append({"role": "assistant", "content": resp.content})
            results = []
            for tu in tool_uses:
                executor = executors.get(tu.name)
                obs = await executor(tu.input) if executor else f"Unknown tool: {tu.name}"
                results.append({"type": "tool_result", "tool_use_id": tu.id, "content": obs})
            messages.append({"role": "user", "content": results})

        # Safety net: the forced final turn should have returned a digest above.
        # Only reached if the model defies a forced tool call — degrade gracefully.
        log.warning("agent_iteration_guard_hit", finding=plan.title, tokens=tokens_used)
        sections = _fallback_sections(plan)
        return DigestResult(
            sections=sections,
            body_md=_assemble_body(sections),
            model=self.settings.digest_model,
            cited_urls=[s.candidate.url for s in plan.sources],
            hit_iteration_guard=True,
        )

    def _finalize(self, tool_input: dict) -> DigestResult:
        sections = DigestSections(
            what_changed=tool_input.get("what_changed", "").strip(),
            why_it_matters=tool_input.get("why_it_matters", "").strip(),
            technical_details=tool_input.get("technical_details", "").strip(),
            sources_md=tool_input.get("sources", "").strip(),
        )
        body = _assemble_body(sections)
        cited = list(dict.fromkeys(_URL_RE.findall(sections.sources_md)))
        return DigestResult(
            sections=sections,
            body_md=body,
            model=self.settings.digest_model,
            cited_urls=cited,
            hit_iteration_guard=False,
        )
