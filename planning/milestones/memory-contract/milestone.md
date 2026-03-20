# Milestone: Memory Contract

**Status**: planned
**Sessions**: 1
**Stories**: 1
**Prerequisite**: derived-prompts

Memory is a required component of agent identity, not an optional tool. Every orchestrator-level agent MUST have a memory ToolPackage. Subagents MAY have NullMemory (metadata-only, no callable tools). This is the formalization of what "identity" means in `A(soul, tools, memory) = identity`.

Converged through three-way architectural discussion (Claude Code + Claude Web + Gemini). See `planning/memos/MOBIUS_PRINCIPLE.md` for the theoretical foundation: without memory, the agent is a stateless function — a cylinder, not a Möbius strip.

## Memory Contract

Four operations, partitioned by caller:

| Operation | Caller | Description |
|-----------|--------|-------------|
| `recall(query, opts?)` | Agent (tool) | Returns capsules. Opts: `limit`, `threshold`. Response includes `truncated` flag |
| `store(capsule, meta?)` | Agent (tool) | Persists entry. Operation-level meta: `ttl`, `priority`, `tags`, `uncertainty` |
| `forget(query)` | Agent (tool) | Fuzzy by query, not strict ref ID (LLMs hallucinate UUIDs) |
| `consolidate(trigger)` | Orchestrator (system method) | Lifecycle signal. Strategy owns *how*, orchestrator owns *when*. Trigger: `session_end \| pressure \| scheduled`. Returns stats |

`status()` deferred to v1.1 — ship the core, add observability when real usage reveals the need.

### Package-Level Metadata (orchestrator reads at construction)

- `persistence: bool` — does memory survive the session?
- `scope: enum(private | shared | inherited)` — visibility boundary
- `consolidation: bool` — does this strategy respond to consolidate signals?

### Operation-Level Metadata (strategy reads at call time)

- `ttl: enum(session | persistent | expiring(duration))`
- `priority: float` — salience hint for consolidation
- `tags: string[]`
- `uncertainty: float`

### Strategies

- **NullMemory**: `tools: []`, metadata populated (`persistence: false`), all operations are no-ops returning empty/zero. Valid third strategy alongside keyword and embedding.
- **KeywordMemory**: Existing `createKeywordMemoryPackage`, conformed to new contract.
- **EmbeddingMemory**: Existing `createEmbeddingMemoryPackage`, conformed to new contract.

### ToolPackage Partitioning

ToolPackage interface gains explicit separation between agent tools (LLM-callable, appear in derived prompt) and system methods (orchestrator-callable, never in LLM's tool list). `consolidate` is a system method. `recall`, `store`, `forget` are agent tools (except in NullMemory where tools is empty).

## Storage

**SQLite via `better-sqlite3`** for capsule storage. Embedded, no infra, portable across interfaces (critical for multi-interface milestone). Keyword strategy uses FTS5 natively. Embedding strategy upgradeable to `sqlite-vec` when needed. No Postgres, Redis, or networked storage — every external dependency is infra to maintain and a portability obstacle.

**File-per-identity isolation.** Each agent identity gets its own SQLite file. Privacy enforced at filesystem level, not by WHERE clauses. For `scope: inherited`, orchestrator opens parent's file as read-only and passes both handles. SQLite supports concurrent readers natively. One test: two agents, two identities, prove recall never crosses the boundary.

Session logs stay JSONL. Conversation history stays in-memory client-side. Don't change what works.

## Extensibility Hooks (for future pain/depth system)

Three additions that cost almost nothing now but enable the pain-as-prediction-error feedback loop later (see `planning/suggestions/pain-as-prediction-error.md`):

1. **Provenance on capsules** — `{ sessionId, trustAssessment, agentIdentity }` at store time. Without provenance, you can't trace cascading invalidation when a trust model turns out to be wrong.
2. **Discriminated union for consolidation triggers** — `type ConsolidationTrigger = { type: 'session_end' } | { type: 'pressure' } | { type: 'scheduled' }`. Extensible to `{ type: 'invalidation', depth: number, root: string }` without contract revision.
3. **Mutable confidence** — capsule confidence field that the orchestrator can revise downward post-hoc. Recall naturally deprioritizes low-confidence capsules. Minimal hook for Type 2 (multi-layer) error recovery.

## Key Decisions

- Memory required at orchestrator level, validated at construction time by createAgentCore()
- NullMemory carries metadata but no tools — orchestrator can derive "you have no persistent memory" in system prompt, LLM can't hallucinate Store/Recall calls
- `forget` is fuzzy (by query) not strict (by ref ID) — LLMs are bad at reproducing UUIDs
- `consolidate` is orchestrator-only, never in LLM tool list
- Consolidation triggers as discriminated union, not flat enum (extensible for future invalidation triggers)
- `scope: inherited` means orchestrator must inject parent memory reference at construction (wiring obligation explicit in contract)
- SQLite (embedded) over Postgres/Redis — portability and zero-infra trump scale
- File-per-identity isolation over query-level isolation — filesystem guarantees > SQL predicates
- Existing memory code is promoted, not rewritten

## Key Risks

- Contract rigidity — don't over-specify. Ship 4 operations, add `status()` when real usage demands it
- `scope: inherited` wiring adds dependency injection complexity to orchestrator
- Fuzzy `forget` needs strategy-specific matching (keyword vs embedding similarity)

## Verification Gate

- [ ] Memory contract types defined (4 operations, package metadata, operation metadata)
- [ ] ToolPackage interface supports system methods partition (agent tools vs orchestrator methods)
- [ ] NullMemory strategy exists with `tools: []` and populated metadata
- [ ] KeywordMemory conforms to new contract (recall with opts, store with meta, forget by query, consolidate with trigger)
- [ ] EmbeddingMemory conforms to new contract
- [ ] All three strategies pass shared contract tests (swappability proven)
- [ ] Orchestrator validates memory ToolPackage presence at construction
- [ ] Derived prompts reflect memory metadata (NullMemory → "no persistent memory")
- [ ] Consolidation wired as lifecycle signal (orchestrator can trigger at session end)
- [ ] Existing tests pass (backward compatibility)

## Files

`packages/memory/src/index.ts`, `packages/memory/src/tools.ts`, `packages/memory/src/keyword-package.ts`, `packages/memory/src/embedding-package.ts`, `packages/llm/src/tool/index.ts` (ToolPackage interface), `packages/llm/src/orchestrator/index.ts`
