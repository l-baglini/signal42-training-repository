---
name: add-agent-tool
description: How to add or modify a tool in the digest agent's ReAct loop, or edit the agent's system prompt, using the Anthropic Python SDK's tool use. Use this skill whenever the user wants the digest agent to be able to do something new (a new action it can take mid-loop), wants to change the digest's structure or behavior, or mentions the agent's tools, the ReAct loop, or its system prompt. Following it preserves the loop's safety guards and the cite-everything contract.
---

# Add or change an agent tool

The digest agent is a ReAct loop (Thought → Action → Observation, repeat →
write digest). "ReAct" here is the reason/act agent pattern, NOT the React
frontend. Tools are the "Action" surface: each one is something Claude can
call mid-loop to gather or check information before writing. Existing tools
typically include a search query, fetch-and-extract page text, and (only if
Qdrant exists) a vector lookup.

## When to use

Use this when extending what the agent can DO, or changing how/what it
writes. Symptoms: "let the agent also check X", "have it verify Y before
writing", "change the digest sections", "make it stricter about citations".

## Two things you might be changing

### A) Adding a tool

1. **Read the existing tool definitions first** in `agent/`. Match the
   established pattern for how a tool is declared to the SDK and how its
   result is fed back as an Observation.
2. **Define the tool schema** (name, description, JSON input schema) the way
   the `anthropic` SDK tool use expects. The description is what makes Claude
   call it correctly — write it for the model, precisely. Verify the CURRENT
   SDK tool-use shape rather than coding from memory; delegate that to the
   `library-researcher` subagent if unsure (the SDK moves).
3. **Implement the handler** that runs when Claude calls the tool, and return
   its result as a tool_result block. Keep handlers pure-ish: do the I/O,
   return structured output, no surprise side effects.
4. **Register the tool** in the agent's tool list AND its dispatch/handler
   map. Both, or Claude will call a tool that does nothing.
5. **Respect the max-iteration guard.** A new tool can lengthen loops. Make
   sure the guard still terminates the loop and that hitting it degrades
   gracefully (write the best digest so far, log it) rather than erroring.
6. **Mind the cost.** Every tool call is more tokens and latency. If a tool
   can return huge text, truncate/summarize before feeding it back as an
   Observation.
7. **Unit-test the loop control**, not Claude: simulate a tool_use response,
   assert the handler is dispatched, the result is fed back, and the guard
   fires at the limit.

### B) Editing the system prompt

The agent's system prompt is a single labeled, editable constant (do not
scatter it). When changing it, preserve these invariants — they're the
product, not boilerplate:

- Audience: experienced engineer; technical and concise.
- Cite every claim with its source. Never fabricate sources or facts.
- Use tools to verify before writing.
- Flag uncertainty explicitly.
- Output structure: **What changed / Why it matters / Technical details /
  Sources.**

If you change the output structure, update anything that parses/stores the
digest and the frontend that renders those sections — they're coupled.

## Don't

- Don't remove the max-iteration guard.
- Don't let the agent write a digest without citations to satisfy a loop
  that ran out of sources — better a short digest that says so.
- Don't hardcode the model id or key; both come from central env config.