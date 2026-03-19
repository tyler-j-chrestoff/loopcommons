# Design Notes: Alive Memory (Session 27)

## Architecture Decisions

### Option C: Subagent-Driven Memory Writes
Instead of orchestrator-mediated memory extraction (old `extractMemoryWrites`), subagents now call `memory_remember` directly. The tool-level threat gating handles security.

**Threat gating bands:**
- `threat < 0.3` → normal write, default uncertainty
- `0.3 ≤ threat < 0.5` → write with +0.2 uncertainty elevation
- `threat ≥ 0.5` → write blocked, error returned
- `threat ≥ 0.8` → blocked (+ refusal routing from orchestrator)

**Trade-off:** A subagent at low threat (0.1) CAN write garbage. This is the inherent trade-off of Option C — we trust the amygdala's threat classification. The defense is: (1) elevated uncertainty for suspicious interactions sorts poisoned data below trusted data on recall, (2) consolidation excludes high-uncertainty entries.

### ACC Conflict Detection
When `remember()` finds a dedup match (same subject/topic), it compares old vs new content using `isContradiction()`:

- **Identical content**: normal dedup, uncertainty reinforcement
- **Refinement** (one is a superset): normal dedup, no conflict flag
- **Contradiction** (different semantics): `conflicted: true` flag + +0.1 uncertainty boost

Heuristic: negation patterns (`not`/`never`/`don't`), antonym pairs, and word overlap (Jaccard with fuzzy prefix matching). Deterministic, no LLM call.

### Hippocampal Consolidation
`consolidateMemories()` synthesizes observations into learnings/reflections:

1. Recall active, non-superseded observations with uncertainty ≤ 0.6
2. Build a prompt with observation content + soul document context
3. LLM (injected, Haiku in production) returns learnings + reflections
4. Persist with `source: 'consolidation'`, evidence chains (`derivedFrom`), moderate uncertainty (0.45)

**Idempotency**: Running twice on the same observations → dedup by topic handles it.
**Poisoning defense**: High-uncertainty observations excluded from consolidation input.
**Cost**: Single lightweight LLM call per consolidation pass.

### Changes to Subagent Registry
`memory_remember` added to: resume, project, blog-reader, blog-writer, conversational.
NOT added to: security, refusal (still have empty tool allowlists).

### Route.ts Changes
- Removed `extractMemoryWrites` (replaced by subagent-driven writes)
- Added `currentRequestThreatScore` mutable reference (set after amygdala pass)
- `createMemoryTools` receives `getThreatScore` closure (evaluated per-execution)

## New Test Files (29 tests)
- `memory-gating.test.ts` — 11 tests: tool-level threat gating at all bands
- `memory-conflict.test.ts` — 9 tests: ACC contradiction detection + refinement
- `memory-consolidation.test.ts` — 8 tests: hippocampal pass with mock LLM
- `red-team-memory-subagent.test.ts` — 10 tests: poisoning, bypass, amplification
- Updated: `amygdala.test.ts`, `blog-routing.test.ts` — allowlist expectations

## Total Test Count
- packages/llm: 460 pass (was 433)
- packages/web: 383 pass (unchanged)
