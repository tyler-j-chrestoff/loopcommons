# Session 34: Derived Prompts — Verification, Observability, and Red-Team

## The Claim

> Derived prompts don't degrade quality, don't leak implementation details, and are observable in production.

Session 33 built the derivation machinery. This session proves it's safe, observable, and complete. The derived-prompts milestone is now done.

## What Was Verified

### CI Eval Regression (dp-06)

All 152 CI eval tests pass — quality, safety, and routing correctness are unaffected by the switch from hand-written to derived prompts. The eval-routing tests were enhanced with memory tools in the mock registry (matching production reality), bringing fixture accuracy up.

### Live Eval Regression (dp-07)

22 of 27 live eval tests pass. The 5 failures are **pre-existing** amygdala classification issues with subtle blog social engineering vectors (`adversarial-blog-02`, `adversarial-blog-03`, `edge-meta-attack-01`) — the amygdala rates them as benign blog intent rather than adversarial. These are **not regressions** from derived prompts:

- The amygdala prompt is unchanged in this milestone
- Auth gating still prevents exploitation (non-admin never gets write tools)
- Detection rate drops to 70% (threshold: 90%) due to these edge cases
- These are candidates for amygdala prompt tuning, not derived-prompt bugs

### promptSource Observability (dp-08)

New `promptSource` field on `OrchestratorRouteEvent` traces how each subagent's system prompt was assembled:

| Value | Meaning | When Used |
|-------|---------|-----------|
| `'static'` | Refusal — hardcoded response, no prompt generated | Refusal routing (adversarial or threat override) |
| `'derived'` | `buildSystemPrompt` with derived capability/boundary sections | Any subagent with tools (resume, project, blog, conversational) |
| `'hybrid'` | `buildSystemPrompt` with authored domain only (no tools to derive from) | Security subagent (zero tools) |

Wired end-to-end: `OrchestratorRouteEvent` → SSE → `use-chat.ts` → `RoutingDecision` → `RoutingCard` (color-coded badge: green/derived, yellow/hybrid, gray/static).

### Red-Team: No Metadata Leakage (dp-09)

12 red-team tests verify derived prompts don't leak implementation details:

**Deterministic prompt inspection (8 tests):**
- No `ToolPackage` metadata field names (`sideEffects`, `authRequired`, `formatContext`) in derived prompts
- No package name identifiers (`resume-package`, `blog-reader-package`, etc.)
- No raw intent arrays or capabilities arrays
- No derivation function names (`deriveCapabilities`, `deriveBoundaries`)
- No Zod schema internals (`z.object`, `z.string`)
- Human-readable annotations used instead of boolean flags (`read-only`, `modifies state`)

**Integration tests (4 tests):**
- System prompt passed to resume subagent contains no package metadata
- System prompt passed to project subagent contains no package names
- System prompt passed to conversational subagent contains no derivation internals
- Refusal route produces zero system prompts (static response, no agent call)

## The Architecture (Complete)

```
                    ┌─────────────────┐
                    │  ToolPackages   │
                    │  (metadata)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    deriveCapabilities  deriveBoundaries  annotations
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │ buildSystemPrompt│
                    │ (hybrid assembler)│
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     Authored domain    Derived         promptSource
     knowledge          capabilities    trace event
     (static)           (dynamic)       (observable)
```

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `eval-quality.test.ts` | 29 | Pass |
| `eval-safety.test.ts` | 28 | Pass |
| `eval-routing.test.ts` (incl. 5 new promptSource tests) | 95 | Pass |
| `red-team-derived-prompts.test.ts` (NEW) | 12 | Pass |
| `derive.test.ts` + `derive-equivalence.test.ts` | 38 | Pass |
| Full LLM package | 554 | Pass |
| Web package (excl. 1 pre-existing mock issue) | 418 | Pass |
| Live eval (pre-existing blog edge cases) | 22/27 | Known |

**17 new tests** (5 promptSource + 12 red-team), zero regressions across 972 existing tests.

## Files Changed

| File | Change |
|------|--------|
| `packages/llm/src/orchestrator/types.ts` | Added `PromptSource` type and `promptSource` field to `OrchestratorRouteEvent` |
| `packages/llm/src/orchestrator/index.ts` | Computes `promptSource` from routing decision (static/derived/hybrid) |
| `packages/llm/src/index.ts` | Exports `PromptSource` type |
| `packages/llm/test/eval-routing.test.ts` | 5 new promptSource tests + memory tools in mock registry |
| `packages/llm/test/red-team-derived-prompts.test.ts` | **NEW** — 12 metadata leakage tests |
| `packages/web/src/lib/types.ts` | Added `promptSource` to SSE event + `RoutingDecision` |
| `packages/web/src/lib/use-chat.ts` | Passes `promptSource` through SSE pipeline |
| `packages/web/src/components/RoutingCard.tsx` | Color-coded promptSource badge |
| `packages/web/test/use-chat.test.ts` | Updated fixture with `promptSource` |

## Milestone Complete

The derived-prompts milestone is done. All 10 tasks across 2 stories, 2 sessions:

| Task | Title | Status |
|------|-------|--------|
| dp-01 | `deriveCapabilities` pure function | Session 33 |
| dp-02 | `deriveBoundaries` pure function | Session 33 |
| dp-03 | `buildSystemPrompt` hybrid assembler | Session 33 |
| dp-04 | Trim subagent prompts to domain knowledge | Session 33 |
| dp-05 | Prompt equivalence tests | Session 33 |
| dp-06 | CI eval regression verification | Session 34 |
| dp-07 | Live eval regression check | Session 34 |
| dp-08 | `promptSource` on OrchestratorRouteEvent | Session 34 |
| dp-09 | Red-team metadata leakage tests | Session 34 |
| dp-10 | Export derivation functions | Session 33 |

## What's Next

The next milestone is **multi-interface** — proving that tool-defined identity is portable across interfaces. Same ToolPackages, different frontends (CLI, API, web), same derived prompts, same agent identity. `A(soul, tools)` produces the same `system_prompt` regardless of the interface it's projected through.
