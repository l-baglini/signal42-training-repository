---
name: add-source-connector
description: How to add a new authoritative source type to the backend's source_discovery module (e.g. GitHub releases, arXiv, RSS feeds, a specific blog, a docs site). Use this skill whenever the user wants to add, wire up, or extend where the app pulls sources from, or mentions a new place to gather news/releases/papers — even if they don't say the word "connector." Following it keeps every source consistent in authority scoring, dedup, and the Topic→Finding pipeline.
---

# Add a source connector

The `source_discovery` module finds candidate sources for a topic. Each
source TYPE (GitHub releases, arXiv, RSS, a docs site, a named blog) is a
connector with a uniform interface so the rest of the pipeline —
`rank_dedup`, `finding_detection`, the agent — doesn't care where a source
came from. The whole point is uniformity: a new connector must emit the same
shape as existing ones, or it breaks ranking and dedup downstream.

## When to use

Use this whenever adding or extending where sources come from. Symptoms:
"also pull from arXiv", "add the Kubernetes blog", "watch GitHub releases
for this repo", "include RSS feeds".

## The connector contract

Every connector takes a topic and returns a list of candidate sources in the
SAME normalized shape. Do not invent per-connector fields that downstream
modules won't understand. At minimum each candidate carries:

- `url` — canonical, de-trailing-slashed, fragment-stripped (dedup depends
  on this being normalized consistently across connectors).
- `title`
- `published_at` — best available timestamp, UTC. Recency ranking needs it;
  if a source has none, set it explicitly to null, don't guess.
- `source_type` — the connector's identifier (e.g. `github_release`).
- `authority_hint` — what tier this source is (official / first-party docs /
  reputable blog / aggregator). `rank_dedup` uses this; see below.
- `raw_ref` — enough to let `fetch` retrieve full text/images later.

## Steps

1. **Read the existing connectors first.** Open `source_discovery/` and
   mirror the established interface and the candidate dataclass/schema. Match
   it exactly — consistency here is the feature.
2. **Implement the connector** as its own file/class under
   `source_discovery/`. Keep it I/O only: discover candidates, normalize,
   return. No ranking, no fetching of full bodies, no LLM calls — those are
   other modules' jobs.
3. **Set `authority_hint` honestly.** Official release notes and first-party
   docs outrank random aggregators. If you inflate authority here, the whole
   ranking is wrong. When unsure, place it conservatively (lower).
4. **Normalize URLs the same way every connector does.** If dedup logic
   lives in `rank_dedup`, reuse its normalization helper rather than writing
   a new one — two normalizers means duplicate sources slip through.
5. **Register the connector** wherever discovery enumerates its sources
   (a registry list / config). A connector nobody calls does nothing.
6. **Respect rate limits and auth.** Many sources (GitHub API, some search
   APIs) rate-limit or need a token. Pull credentials from env via the
   central config — never hardcode. Handle 4xx/5xx and empty results
   gracefully; a flaky source must not crash a topic's whole run.
7. **Unit-test the normalization + parsing**, not the network. Feed a saved
   sample payload, assert the normalized candidates come out right
   (especially `url` normalization and `published_at` parsing). These are
   exactly the bits that silently rot.

## Example

**Adding GitHub releases:**
- Input: topic "spark" → resolve to the relevant repo(s).
- Connector hits the releases API, maps each release to a candidate:
  `source_type="github_release"`, `authority_hint="official"`,
  `published_at` from the release timestamp, `url` the release page.
- Returns the normalized list. `rank_dedup` and `finding_detection` take it
  from there unchanged.

## Don't

- Don't let a connector rank, dedup, or summarize — single responsibility.
- Don't add fields the pipeline doesn't read.
- Don't skip `published_at` handling; recency scoring quietly degrades
  without it.