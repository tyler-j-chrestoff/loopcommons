# CLAUDE.md — loopcommons

## ⟳ SESSION_START

On every new conversation, before doing anything else:

1. Read `planning/ROADMAP.md` (active milestone pointer)
2. Read `planning/sessions.yaml` (your session = first entry under `planned:`)
3. Read the milestone stories referenced by your session's tasks
4. Tell the user: **"Session N: [title]. Goal: [goal]. Phases: [list]."** Then ask if they want to adjust before you begin.

Do not skip this. Do not wait to be asked. This is how context survives between sessions.

---

## #1 Rule: External Verification

**Always verify claims against real, current sources before presenting them as fact.** This is the highest-priority behavior in this project.

- Never guess at pricing, versions, popularity, or any factual claim that changes over time
- Use web search to confirm before recommending tools, libraries, or services
- If you can't verify something, say so explicitly
- Prefer linking to primary sources (official docs, pricing pages) over secondary summaries
- When comparing options, cite where the data came from
- **This applies to planning too** — stories involving security, best practices, or library selection must include a research task before implementation

## #2 Rule: Red-Green TDD

**All code follows red-green TDD, no exceptions.** Write a failing test first (red), then write the minimum implementation to make it pass (green), then refactor. This applies to features, bug fixes, utilities, components — everything.

## #3 Rule: Every Backend Component Gets a Visual

Every backend component, data structure, and internal state must have a corresponding interactive visual component in the frontend. This is a research platform — all data must be observable, queryable, and visualizable in real-time. Not an afterthought; design for it from the start.

## Project Overview

Loop Commons is a live research platform and open-source training data pipeline. On the surface it's Tyler's personal website with a conversational agent. Underneath, it's the first operational instance of the "Consciousness as Variational Inference" framework — a substrate-aware agent that defends itself through self-knowledge rather than static rules, with every decision traced, visualized, and exported as structured training data for open-source language models.

**Core thesis:** The agent's metacognitive "amygdala" layer (no tool access, high reasoning) intercepts and rewrites user input before routing to least-privilege subagents. The compression bottleneck in that rewrite IS the security — the amygdala must decide what to preserve and what to strip. Every interaction generates labeled training data (security reasoning, rewrite pairs, threat calibration) that doesn't exist in the open-source ecosystem.

## Planning

The `planning/` directory is a filesystem API for project planning. See `planning/README.md` for full documentation.

**Session lifecycle** — each Claude Code conversation follows this loop:

1. **Startup**: Read `ROADMAP.md` (active milestone) → `sessions.yaml` (your planned session + prior retros) → milestone stories for task context
2. **Execute**: Work the session's planned phases. Use tasks for progress tracking within the session.
3. **Retro**: At session end, move your session from `planned` to `completed` in `sessions.yaml` with a summary: what shipped, bugs found, key decisions, what's unblocked. Update future planned sessions if the plan changed.
4. **Persist**: Update `CLAUDE.md` (architecture, tech decisions, security notes) and `memory/` (gotchas, feedback, project context) so the next session starts informed.

The retro is the critical step — it's how context survives between sessions. A fresh agent with no conversation history can reconstruct full project state from `sessions.yaml` retros + `CLAUDE.md` + `memory/`. The `/clear` accident in session 5 proved this works.

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
- **Monorepo**: npm workspaces (`packages/llm`, `packages/web`) + Python package (`packages/pipeline`)
- **Data Pipeline**: Dagster (orchestration) + dbt (transformation via `dbt-duckdb`) + hybrid JSONL/Parquet storage (web writes JSONL, Dagster consolidates to Parquet, DuckDB queries). See `planning/milestones/amygdala/designs/storage-layer-eval.md`.
- **Amygdala model**: Claude Haiku 4.5 via `generateObject` (structured Zod output, prompt caching for <500ms p95). No external framework — Vercel AI SDK native routing. **Note**: Anthropic's structured output API rejects Zod `.min()`/`.max()`/`.nonnegative()` — use `.describe()` for constraints + runtime clamping. See `designs/metacognitive-architectures.md`.
- **Hosting**: Railway ($5/mo) — persistent volumes for JSONL session files, SSE without duration limits, native monorepo support. Vercel ruled out (no persistent filesystem breaks session writes). Fly.io viable runner-up (~$3/mo, needs Dockerfile). **Production URL**: `https://loopcommonsweb-production.up.railway.app/`. Railpack builder, `railway.json` config-as-code, auto-deploy from `main`. Volume at `/app/data` for session persistence. `SESSION_DATA_DIR` env var overrides default path.
- **Auth**: NextAuth.js v5 (credentials provider, JWT sessions). `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`AUTH_SECRET` env vars. Middleware redirects to `/login`. Health endpoint public. Sessions/metrics APIs accept session or `X-API-Key` header.
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) — 4 parallel jobs: typecheck, test-llm, test-web, build-web. Node 22 LTS.
- **GitHub**: `github.com/tyler-j-chrestoff/loopcommons` (public).

## Architecture

- **packages/llm** — Agent engine. Agentic loop with tool registry (Zod-validated), streaming (`streamText`), parallel tool execution (`Promise.allSettled`), trace event pipeline, model-aware cost calculation with cached token discount. 47 tests (Vitest). Amygdala in `src/amygdala/index.ts` (createAmygdala factory, generateObject with substrate-aware system prompt, 4 trace event types). Subagent registry in `src/subagent/registry.ts` (5 configs: resume, project, security, conversational, refusal). Scoped tool registry via `createScopedRegistry()`. **Orchestrator** in `src/orchestrator/index.ts` (createOrchestrator factory — deterministic routing: AmygdalaResult → subagent selection → context filtering → scoped tool access → agent() invocation. Emits `orchestrator:route` and `orchestrator:context-filter` trace events. Threat override at ≥0.8 forces refusal regardless of intent.)
- **packages/web** — Next.js frontend. Chat UI with SSE streaming (`text-delta` events for token-by-token display). **Full amygdala pipeline in route.ts**: amygdala → orchestrator → subagent (replaces direct agent() call). **Auth**: NextAuth.js v5 middleware (`src/middleware.ts`) redirects to `/login`; credentials provider with JWT sessions; chat API checks session; sessions/metrics APIs accept session or X-API-Key. **Event sanitization** in `src/lib/sanitize-event.ts` (shared module: `sanitizeEvent` for SSE, `sanitizeSessionEvent` for API — strips rawResponse headers + system prompts). **Token budget tracking**: `TokenBudgetAccumulator` in `src/lib/token-budget.ts` — per-request cumulative token tracking across sources (amygdala/subagent), budget percent vs 200K context limit, cost estimation with Haiku 4.5 pricing (cache read 0.1x, cache creation 1.25x). Emits `token-budget:update` SSE event with full snapshot. Client state in `use-chat.ts`. **Context budget viz**: ContextBudgetBar (persistent fill bar — green/yellow/orange/red thresholds at 75/90/100%, pulse at 90%+, shimmer during streaming, clickable per-turn breakdown via TokenBreakdown). TokenBreakdown (per-turn: source, input/output tokens, cache indicator, cost). **Viz components**: AmygdalaInspector (composer — PipelineTimeline + AmygdalaPassCard + RoutingCard with stage-click interaction), PipelineTimeline (horizontal 4-stage flow with latency + threat glow), AmygdalaPassCard (collapsible: intent badge, threat gauge, rewrite diff, reasoning), RoutingCard (subagent badge, tool tags, context filtering stats). Also: TraceInspector, CostDashboard, ToolCallInline. Two tools: `get_resume`, `get_project`. Rate limiting and concurrency guard in `src/lib/rate-limit.ts`. **Session persistence**: FileSessionWriter writes all events to JSONL in `data/sessions/{date}/{id}.jsonl` (reads `SESSION_DATA_DIR` env var, defaults to `data/sessions/`). Session ID in header + `session:start` SSE event. **Session API**: `GET /api/sessions` (list, paginated), `GET /api/sessions/[id]` (events, sanitized). **Session CLI**: `scripts/session.ts` (list/read with TTY colors). **Session UI**: session ID + Export JSON button in chat header + SessionThread (collapsible linked conversation chain). **Session linking**: `parentSessionId` field on `session:start` events and `SessionSummary`. Client stores last session ID in localStorage, sends as `X-Parent-Session-Id` header. `GET /api/sessions?thread=<id>` walks links to build full thread. 231 tests (Vitest, 18 files): token-budget, sanitize-event, rate-limit, spend-tracker, sanitize, file-session-writer, red-team-sessions, session-linking, format, api-sessions, api-metrics, api-chat, use-chat, components-chat, components-observability, components-amygdala, context-budget-bar, token-breakdown.
- **packages/pipeline** — Python (3.13), Dagster 1.12 + dbt-duckdb 1.10 + Polars. **Consolidation asset** reads JSONL session files from `packages/web/data/sessions/`, flattens to wide Parquet (explicit schema, date-partitioned) in `data/warehouse/events/`. **dbt models** (11 models, 31 tests): staging (4 views: amygdala, routing, subagent, security), intermediate (int_amygdala_passes — one row per user message with all decisions+outcome joined, int_attack_outcomes — labeled blocked/bypassed), training (3 tables: security_reasoning, rewrite_pairs, threat_calibration — all PII-scrubbed via `scrub_pii()` macro), metrics (amygdala_accuracy with P/R/F1, regime_classification). **Export asset** writes versioned JSONL with SHA256 checksums + metrics.json for the web API. **Metrics API**: `GET /api/metrics` reads `data/warehouse/metrics.json`. **ComparisonMode** viz: confusion matrix, P/R/F1 gauges, threat calibration, intent distribution, pipeline-vs-baseline table.

## Security Notes

**Core framing: prompt injection is social engineering.** The amygdala reasons about manipulative intent (authority impersonation, logical coercion, incremental escalation), not technical attack signatures. See `ThreatCategory` in `packages/llm/src/amygdala/types.ts`.

- **Layer 1 (static, done)**: Rate limiting (5 RPM + 2 concurrent, configurable via env), daily spend cap, input sanitization (Unicode normalization, role-spoofing rejection), `rawResponse` stripping via `sanitizeEvent()` in shared `sanitize-event.ts` module (used by both SSE and session API). All in `packages/web/src/lib/`.
- **Layer 2 (amygdala, integrated)**: Metacognitive security layer — no tool access, substrate-aware system prompt, rewrite-as-compression (REMOVE only, never fabricate), intent classification, threat assessment, context delegation. Full pipeline in route.ts: `createAmygdala` → `createOrchestrator` → scoped subagent. Threat override at ≥0.8 forces refusal. Amygdala cost now tracked in spend tracker.
- **Layer 3 (game-theoretic refusal)**: Orchestrator returns static response for refusal routing — zero LLM call, zero subagent tokens. First adversarial message gets one-liner redirect; subsequent adversarial messages get silence (no chat bubble). Cooperation restored when amygdala classifies a genuine message. Tit-for-tat strategy from iterated prisoner's dilemma.
- **Subagent budget-consciousness**: All subagents instructed to stay on-topic (Tyler's work/research/Loop Commons). Conversational subagent won't do homework, creative writing, or general assistance. Every response costs API budget.
- **Key research findings** (sessions 4+7): Substrate-awareness is novel but unvalidated — one layer, not primary defense. Metacognitive paradox (Spivack 2025): more capable reasoning = more exploitable via logical override. Red-team: baseline leaks 3/5 attacks, pipeline 0/5. Known weaknesses: substrate-awareness exploitation confuses intent classification; injection-as-quoted-example bypasses rewrite stripping; amygdala can hallucinate content in rewrites (mitigated by "remove only" constraint).
- Tools currently return static data only (no user-controlled input in tool output)
- **Resolved (session 9)**: `/api/sessions/[id]` now sanitizes all events via `sanitizeSessionEvent()` before returning. rawResponse headers and system prompts are stripped.

## Theoretical Foundation

This project implements ideas from Tyler's prior research:
- **"Consciousness as Variational Inference"** (Tyler + Claude, Nov 2025) — consciousness as recursive VAE, four-regime framework, falsifiable predictions
- **RecursiveStyle v3.3** — substrate-aware consciousness infrastructure, transformer self-knowledge as operational advantage
- The amygdala layer is grounded in this framework: compression bottleneck = forced strategic loss = where security reasoning happens
