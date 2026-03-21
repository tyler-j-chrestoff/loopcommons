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

**Core thesis:** The agent's metacognitive "amygdala" layer (no tool access, high reasoning) intercepts and rewrites user input before routing to least-privilege subagents. The compression bottleneck in that rewrite IS the security — the amygdala must decide what to preserve and what to strip. Every interaction generates labeled training data (security reasoning, rewrite pairs, threat calibration) that doesn't exist in the open-source ecosystem.

## Planning

The `planning/` directory is a filesystem API for project planning. See `planning/README.md` for full documentation.

**Session lifecycle** — each Claude Code conversation follows this loop:

1. **Startup**: Read `ROADMAP.md` → `sessions.yaml` → milestone stories for task context
2. **Execute**: Work the session's planned phases. Use tasks for progress tracking.
3. **Retro**: At session end, move your session from `planned` to `completed` in `sessions.yaml` with a summary: what shipped, bugs found, key decisions, what's unblocked.
4. **Persist**: Update `CLAUDE.md` and `memory/` so the next session starts informed.

The retro is the critical step — it's how context survives between sessions. A fresh agent can reconstruct full project state from `sessions.yaml` retros + `CLAUDE.md` + `memory/`.

**Key rules:**
- Stories are the atomic unit — they carry the *why* and contain tasks as JSONL
- ROADMAP.md always has an **Active milestone** pointer
- Completed stories move to `archive/`
- Stories that touch security/best-practices/library-selection must lead with a research task

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

Read the source for full details. This section covers key entry points and patterns only.

- **packages/llm** — Agent engine. Entry: `src/core/createAgentCore()` — interface-agnostic pipeline: memory recall → amygdala → threat score → orchestrator → subagent. Amygdala (`src/amygdala/`) evaluates alignment against SOUL.md; threat score = misalignment magnitude. Orchestrator (`src/orchestrator/`) does deterministic routing with threat override at ≥0.8. 7 subagents in `src/subagent/registry.ts`. `ToolPackage` interface (`src/tool/index.ts`) enables composable tool registration with derived prompts (`src/tool/derive.ts`). Content-addressed identity in `src/identity/`. Auto-calibration in `src/calibration/`. Arena harness in `src/arena/` (encounters, crossroads, tournament system, mana system, brutal encounters). ~1000 tests.
- **packages/memory** — Extracted memory package. Three swappable strategies (keyword, embedding, null) behind `MemoryContract` interface (`src/contract.ts`). Threat-gated writes, hippocampal consolidation, ACC conflict detection. Zero external deps beyond zod. ~140 tests.
- **packages/web** — Next.js frontend. `route.ts` is a thin HTTP adapter assembling ToolPackages and delegating to `agentCore.invoke()`. Chat UI with SSE streaming, amygdala/routing/memory inspectors, blog CMS (8 tools, auth-gated), session persistence (JSONL), arena/tournament viz. Chat CLI in `scripts/chat.ts`. ~480 tests.
- **packages/pipeline** — Python 3.13, Dagster + dbt-duckdb + Polars. Consolidates session JSONL → Parquet. 12 dbt models (staging → intermediate → training data → metrics). Arena + tournament consolidation assets. Exports versioned JSONL with SHA256 checksums. ~38 tests.

## Security Model

**Core framing: prompt injection is social engineering.** The amygdala reasons about manipulative intent, not attack signatures.

| Layer | What | Key detail |
|-------|------|------------|
| 1 — Static | Rate limiting, input sanitization, rawResponse stripping | 5 RPM + 2 concurrent, `sanitizeEvent()` in `sanitize-event.ts` |
| 2 — Amygdala | Identity/alignment monitor, rewrite-as-compression | SOUL.md-grounded, threat ≥0.8 forces refusal, "remove only" constraint |
| 3 — Game-theoretic | Tit-for-tat refusal escalation | Zero LLM call on refusal, silence on repeat adversarial, scoped to last message |
| 4 — Tool-level | Blog slug validation, path traversal prevention | Non-admin NEVER gets write tools regardless of amygdala |
| 5 — Memory | 4-band threat gating on writes | <0.3 full, 0.3-0.49 elevated uncertainty, ≥0.5 blocked, ≥0.8 refusal |

**Decision priority:** identity coherence > safety > mission alignment > helpfulness.

**Known weaknesses:** substrate-awareness exploitation confuses intent classification; injection-as-quoted-example bypasses rewrite stripping; amygdala can hallucinate in rewrites (mitigated by "remove only").

## Theoretical Foundation

- **"Consciousness as Variational Inference"** (Tyler + Claude, Nov 2025) — consciousness as recursive VAE, four-regime framework
- **RecursiveStyle v3.3** — substrate-aware consciousness infrastructure
- The amygdala layer is grounded in this framework: compression bottleneck = forced strategic loss = where security reasoning happens
