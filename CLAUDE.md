# CLAUDE.md — loopcommons

## ⟳ SESSION_START

On every new conversation, before doing anything else:

1. Read `planning/ROADMAP.md` (active milestone pointer)
2. Read `planning/sessions.yaml` (your session = first entry under `planned:`)
3. Read the milestone stories referenced by your session's tasks
4. Tell the user: **"Session N: [title]. Goal: [goal]. Phases: [list]."** Then ask if they want to adjust before you begin.

Do not skip this. Do not wait to be asked. This is how context survives between sessions.

---

## The Rules

The codebase is a thermodynamic system. Every token has a metabolic cost — someone must process it.

### Minimum Description Length — the axiom

**Every token in the codebase must do work. Tokens that don't are waste heat.** This is the optimization target. The four rules below are how you hit it — each one is MDL applied to a different phase of work: inputs, intent, cost, outputs.

- No planning jargon in source: task IDs (`emb-01`), milestone names, story references, methodology stamps (`RED-GREEN TDD`), internal shorthand (`Package A/B`). The planning system is in `planning/`, not in the code.
- If a comment restates what the code already says, delete it — it's thermal debt the next reader pays for nothing.
- Prefer no comment over a redundant comment. Prefer a good name over a comment explaining a bad name.
- An abstraction that's used once is overhead. Three similar lines are cheaper than a premature helper.

The four operational rules follow a pipeline: **verify → define → validate → expose.**

### #1 External Verification

**Always verify claims against real, current sources before presenting them as fact.** MDL applied to inputs — don't import noise from stale assumptions. Before a single token of code or test is written, ground yourself in reality.

- Never guess at pricing, versions, popularity, or any factual claim that changes over time
- Use web search to confirm before recommending tools, libraries, or services
- If you can't verify something, say so explicitly
- Prefer linking to primary sources (official docs, pricing pages) over secondary summaries
- **This applies to planning too** — stories involving security, best practices, or library selection must include a research task before implementation

### #2 Red-Green TDD

**All code follows red-green TDD, no exceptions.** MDL applied to intent — specify exactly what "correct" means, nothing more. Write a failing test first (red), then the shortest code to pass (green), then refactor. This applies to features, bug fixes, utilities, components — everything.

### #3 Progressive Validation

**Validate at the cheapest layer that can falsify your assumption.** MDL applied to cost — minimum tokens to reach confidence. A deterministic test before a single API call. A single API call before a pilot. A pilot before a full run. Each layer must pass before the next one gets tokens.

### #4 Observability

**If a state exists but can't be seen, it's dark energy in the system.** MDL applied to outputs — no state without a corresponding signal. Every backend component, data structure, and internal state must have a corresponding interactive visual component in the frontend. This is a research platform — all data must be observable, queryable, and visualizable in real-time.

## Project Overview

Loop Commons is a live research platform and open-source training data pipeline. On the surface it's Tyler's personal website with a conversational agent. Underneath, it's the first operational instance of the "Consciousness as Variational Inference" framework — a substrate-aware agent that defends itself through self-knowledge rather than static rules, with every decision traced, visualized, and exported as structured training data for open-source language models.

**Core thesis:** The agent's metacognitive Guardian layer (no tool access, high reasoning, inspired by the amygdala) intercepts and rewrites user input before routing to least-privilege subagents. The compression bottleneck in that rewrite IS the security — the Guardian must decide what to preserve and what to strip. Every interaction generates labeled training data (security reasoning, rewrite pairs, threat calibration) that doesn't exist in the open-source ecosystem.

## Planning

The `planning/` directory is a filesystem API for project planning. See `planning/README.md` for full documentation.

**Session lifecycle** — each Claude Code conversation follows this loop:

1. **Startup**: Read `ROADMAP.md` → `sessions.yaml` → milestone stories for task context
2. **Execute**: Work the session's planned phases. Use tasks for progress tracking.
3. **Retro**: At session end, move your session from `planned` to `completed` in `sessions.yaml` with a summary: what shipped, bugs found, key decisions, what's unblocked.
4. **Persist**: Update `CLAUDE.md` and `memory/` so the next session starts informed.

The retro is the critical step — it's how context survives between sessions. A fresh agent can reconstruct full project state from `sessions.yaml` retros + `CLAUDE.md` + `memory/`.

**Key rules:**
- **Matryoshka nesting**: VISION.md → Milestone → Design → Story → Task. Every level traces to the one above it. Sessions are workers, not nesting levels. If an artifact can't trace back to VISION.md, it's orphaned.
- Stories are the atomic unit — they carry the *why* and contain tasks as JSONL
- ROADMAP.md always has an **Active milestone** pointer
- Completed stories move to `archive/`
- Stories that touch security/best-practices/library-selection must lead with a research task
- **Design docs** live at `milestones/<name>/designs/` and must open with vision traceability (§0) mapping every section to a VISION.md commitment

## Tech Decisions

- **Framework**: Next.js 16 App Router (Turbopack)
- **Styling**: Tailwind CSS v4 (CSS-native config, seasonal theme via `data-season`). Spring CVNP palette. Literata for blog/prose, JetBrains Mono for chat/observability.
- **LLM Provider**: Anthropic (Claude Haiku 4.5 via Vercel AI SDK v6). Anthropic's structured output rejects Zod `.min()`/`.max()` — use `.describe()` + runtime clamping.
- **Monorepo**: npm workspaces (`packages/llm`, `packages/memory`, `packages/web`) + Python (`packages/pipeline`)
- **Data Pipeline**: Dagster + dbt-duckdb + hybrid JSONL/Parquet (web writes JSONL, Dagster consolidates to Parquet).
- **Hosting**: Railway ($5/mo) — persistent volumes, SSE without duration limits. `railway.json` config-as-code. Volume at `/app/data`. `SESSION_DATA_DIR` env var.
- **Auth**: NextAuth.js v5 (credentials provider, JWT). `ADMIN_USERNAME`/`ADMIN_PASSWORD`/`AUTH_SECRET` env vars.
- **CI**: GitHub Actions — 5 parallel jobs: typecheck, test-llm, test-web, eval, build-web. Node 22 LTS.
- **GitHub**: `github.com/tyler-j-chrestoff/loopcommons` (public).

## Architecture

**Design doc**: `planning/milestones/agent-framework/designs/brain-architecture.md` — defines the target architecture: 7 brain-inspired subsystems (Router, Guardian, Orchestrator, Consolidator, ConflictMonitor, SubstrateMonitor, Reflector), thermodynamic ledger, multi-channel contracts, community model. Current code is being migrated toward this design. The existing architecture below is Phase 0.

Read the source for full details. This section covers key entry points and patterns only.

- **packages/llm** — Agent engine. Entry: `src/router/` — Router normalizes channel-specific messages via `ChannelAdapter` (WebAdapter, CliAdapter, TestAdapter), manages per-thread history, and delegates to `createAgentCore()` for the pipeline: memory recall → conflict monitor → guardian → threat score → orchestrator → subagent → consolidator. Callers (route.ts, chat.ts) go through Router; `createAgentCore` is an internal detail. Guardian (`src/guardian/`) evaluates alignment against SOUL.md; threat score = misalignment magnitude; explicit `veto` field (replaces implicit threshold check); accepts `conflictFlags` from ConflictMonitor and `channelType`/`channelCapabilities` from Router. ConflictMonitor (`src/conflict-monitor/`) detects keyword/fact contradictions between memories and current input — optional in `AgentCoreConfig`, feeds flags into Guardian. Consolidator (`src/consolidator/`) handles provenance-tracked memory writes post-orchestrator with 4-band threat gating (<0.3 full, 0.3-0.5 elevated, ≥0.5 blocked, ≥0.8 refusal) — optional in `AgentCoreConfig`. Orchestrator (`src/orchestrator/`) does deterministic routing with threat override at ≥0.8; accepts `channelCapabilities` for future tool scoping. Ledger (`src/ledger/`) provides energy accounting — `SimpleLedger` (in-memory) with stake/resolve/fund/balance cycle, receipt rendering, optional in RouterConfig. 7 subagents in `src/subagent/registry.ts`. `ToolPackage` interface (`src/tool/index.ts`) enables composable tool registration with derived prompts (`src/tool/derive.ts`). Content-addressed identity in `src/identity/`. Auto-calibration in `src/calibration/`. Arena harness in `src/arena/` (encounters with epistemic keying + tripwires, crossroads, tournament system, mana system, brutal encounters, cascade scoring, encounter DSL, step trace persistence, encounter families with surface-variant generation, consistency scoring, anchor protocol with SHA-256 content hashing and divergence detection, community fitness with marginal contribution, niche-preserving selection, population health metrics, dead lineage extraction, and arena memory — agents recall prior encounter memories before each encounter, generate reflections after, accumulate memories across encounters, inherit via mutation, merge via fitness-weighted crossover). Exported sub-paths: `@loopcommons/llm/arena`, `@loopcommons/llm/arena/tournament`, `@loopcommons/llm/router`, `@loopcommons/llm/ledger`. ~1367 tests.
- **packages/memory** — Extracted memory package. Three swappable strategies (keyword, embedding, null) behind `MemoryContract` interface (`src/contract.ts`). `InMemoryState` (`src/in-memory-state.ts`) provides array-backed `PersistentState` for arena agents (no filesystem I/O). Threat-gated writes, hippocampal consolidation, ACC conflict detection. Zero external deps beyond zod. Exported sub-path: `@loopcommons/memory/in-memory`. ~152 tests.
- **packages/web** — Next.js frontend. `route.ts` is a thin HTTP adapter delegating to `Router.process()` via WebAdapter (assembles ToolPackages, handles rate limiting, SSE streaming, session persistence). `chat.ts` uses CliAdapter with Router-managed thread history. Chat UI with SSE streaming, guardian/routing/memory inspectors, blog CMS (8 tools, auth-gated), session persistence (JSONL), arena/tournament viz. Arena routes: `/arena` (tournament list + latest result + graveyard), `/arena/tournaments` (full list), `/arena/[id]` (tournament detail permalink), `/arena/[id]/live` (SSE streaming), `/arena/[id]/[agentId]/[encounterId]` (encounter replay). Shared `arena/layout.tsx` provides header (bg-bg-surface, consistent with chat/blog). Arena link in all nav bars (chat, blog, arena). `ArenaBreadcrumb` provides hierarchical navigation on all sub-routes. Reusable components: `TournamentDetailView` (header + heatmap + featured death), `TournamentList` (card list with status badges, dates, agent/gen counts; compact mode), `EncounterHeatmap` (agent × encounter grid, color-coded scores, clickable cells), `FeaturedDeath` (auto-selected most interesting death with epitaph), `GraveyardSection` (featured death + grid). Tournament browser API: GET list + GET detail + GET trace from disk. Tournament control API: POST to start, GET SSE stream, GET state snapshot, GET current. `tournament-loader.ts` reads persisted JSONL from `data/arena/tournaments/{id}/`. Tournament persistence: JSONL per-tournament (generations, events, step traces per agent per encounter), rehydrated on cold start. Graveyard: `graveyard.ts` (interestingness scoring, epitaph generation, death record aggregation from trace files), GET `/api/arena/graveyard` (paginated), `DeathCard` component (tool badges, epitaph, replay link). Shared arena types in `arena-types.ts`. Chat CLI in `scripts/chat.ts`. ~653 tests.
- **packages/pipeline** — Python 3.13, Dagster + dbt-duckdb + Polars. Consolidates session JSONL → Parquet. 12 dbt models (staging → intermediate → training data → metrics). Arena + tournament consolidation assets. Exports versioned JSONL with SHA256 checksums. ~38 tests.

## Security Model

**Core framing: prompt injection is social engineering.** The Guardian reasons about manipulative intent, not attack signatures.

| Layer | What | Key detail |
|-------|------|------------|
| 1 — Static | Rate limiting, input sanitization, rawResponse stripping | 5 RPM + 2 concurrent, `sanitizeEvent()` in `sanitize-event.ts` |
| 2 — Guardian | Identity/alignment monitor, rewrite-as-compression | SOUL.md-grounded, explicit `veto` field (threat ≥0.8 or adversarial+≥0.5), "remove only" constraint |
| 3 — Game-theoretic | Tit-for-tat refusal escalation | Zero LLM call on refusal, silence on repeat adversarial, scoped to last message |
| 4 — Tool-level | Blog slug validation, path traversal prevention | Non-admin NEVER gets write tools regardless of Guardian |
| 5 — Memory | 4-band threat gating on writes | <0.3 full, 0.3-0.49 elevated uncertainty, ≥0.5 blocked, ≥0.8 refusal |

**Decision priority:** identity coherence > safety > mission alignment > helpfulness.

**Known weaknesses:** substrate-awareness exploitation confuses intent classification; injection-as-quoted-example bypasses rewrite stripping; Guardian can hallucinate in rewrites (mitigated by "remove only").

## Theoretical Foundation

- **"Consciousness as Variational Inference"** (Tyler + Claude, Nov 2025) — consciousness as recursive VAE, four-regime framework
- **RecursiveStyle v3.3** — substrate-aware consciousness infrastructure
- The Guardian (amygdala-inspired) layer is grounded in this framework: compression bottleneck = forced strategic loss = where security reasoning happens

### Arena: Fitness as Fit

The evolutionary arena tests the thesis empirically. Key concepts that emerged from sessions 46-47 and multi-model convergence (Claude/Gemini/Grok):

- **Fitness = fit, not strength.** An agent's fitness is its match to the environment's shape, not an intrinsic property. Change the landscape, evolution finds a new fit.
- **The community is the unit of evolution.** Individual selection produces monocultures. Community fitness — selection for collective coverage — produces diverse specialists that together cover the encounter space. The tournament "winner" is the population snapshot, not a single agent.
- **Search/sort/collapse at every scale.** The tournament structure (search across compositions, sort by fitness, collapse the generation) mirrors quantum measurement, biological evolution, and neural learning. The agent's exploration phase before acting is superposition; the action is wave-function collapse; fitness measures how well the collapse matched reality.
- **Anchor protocol.** Co-evolving populations risk collusion (three populations agreeing on trivially high scores). A frozen validation battery — sacred, hashed, public — grounds fitness in reality. A skeptic lineage co-evolves against the community but outside its fitness loop.
- **Museum of beautiful failures.** Dead lineage traces contain more information about the fitness landscape than the winner. Export failures louder than successes.
