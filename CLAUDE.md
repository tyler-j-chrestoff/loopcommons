# CLAUDE.md — loopcommons

## #1 Rule: External Verification

**Always verify claims against real, current sources before presenting them as fact.** This is the highest-priority behavior in this project.

- Never guess at pricing, versions, popularity, or any factual claim that changes over time
- Use web search to confirm before recommending tools, libraries, or services
- If you can't verify something, say so explicitly
- Prefer linking to primary sources (official docs, pricing pages) over secondary summaries
- When comparing options, cite where the data came from
- **This applies to planning too** — stories involving security, best practices, or library selection must include a research task before implementation

## Project Overview

Personal website for Tyler with a live LLM-powered conversational agent. Observability-first architecture — every LLM call, tool execution, and cost metric is captured, traced, and visualized.

## Planning

The `planning/` directory is a filesystem API for project planning. See `planning/README.md` for full documentation.

**Session startup:** `cat planning/ROADMAP.md` — the **Active milestone** pointer tells you where to start. Then read the milestone's stories for context and tasks.

**Key rules:**
- Stories are the atomic unit — they carry the *why* (persona) and contain tasks as JSONL
- ROADMAP.md always has an **Active milestone** pointer so agents don't guess
- Completed stories move to `archive/` to keep active dirs sparse
- Suggestions are individual files in `planning/suggestions/` (not a list in ROADMAP.md)
- Stories that touch security/best-practices/library-selection must lead with a research task

## Tech Decisions

- **Framework**: Next.js 16 App Router (Turbopack)
- **Styling**: Tailwind CSS v4 (CSS-native config, dark theme)
- **LLM Provider**: Anthropic (Claude Haiku 4.5 via Vercel AI SDK v6)
- **Monorepo**: npm workspaces (`packages/llm`, `packages/web`)
- **Hosting**: TBD

## Architecture

- **packages/llm** — Agent engine. Agentic loop with tool registry (Zod-validated), streaming (`streamText`), parallel tool execution (`Promise.allSettled`), trace event pipeline, model-aware cost calculation with cached token discount. 8 tests (Vitest).
- **packages/web** — Next.js frontend. Chat UI with SSE streaming (`text-delta` events for token-by-token display), TraceInspector sidebar (round-by-round breakdown, cached tokens, cache hit rate), TraceTimeline, CostDashboard, ToolCallInline. Two tools: `get_resume`, `get_project`.

## Security Notes

- `rawResponse` (Anthropic API headers) is stripped from all SSE events via `sanitizeEvent()` in `route.ts`
- No rate limiting, spend cap, or prompt injection defense yet — that's the active hardening milestone
- Tools currently return static data only (no user-controlled input in tool output)
