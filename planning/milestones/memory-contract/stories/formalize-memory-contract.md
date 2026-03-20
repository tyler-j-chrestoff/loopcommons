# Story: Formalize Memory Contract

**Persona**: As the agent core (createAgentCore), I need a formal memory contract so I can validate that every agent instance has memory as part of its identity, and so strategies are swappable behind a uniform interface.

**Status**: done

**Acceptance criteria**:
- 4-operation contract defined as types
- ToolPackage supports agent tools vs system methods partition
- NullMemory, KeywordMemory, EmbeddingMemory all conform
- Orchestrator validates memory presence at construction
- Derived prompts reflect memory capabilities
- Consolidation wired as orchestrator lifecycle signal
- All existing tests pass

## Tasks

```jsonl
{"id":"mc-01","title":"Define memory contract types","type":"implementation","status":"done","description":"Define MemoryContract interface with 4 operations: recall(query, opts?) → { capsules, truncated }, store(capsule, operationMeta?) → receipt, forget(query) → void, consolidate(trigger) → stats. Define RecallOpts (limit, threshold), OperationMeta (ttl, priority, tags, uncertainty), ConsolidateTrigger enum (session_end, pressure, scheduled), ConsolidateStats. TDD.","estimate":"30min","deps":[],"prereqs":["derived-prompts milestone complete"]}
{"id":"mc-02","title":"Add system methods partition to ToolPackage","type":"implementation","status":"done","description":"Extend ToolPackage interface to support systemMethods alongside tools. System methods are orchestrator-callable, never appear in LLM tool list or derived prompts. consolidate() is the first system method. TDD.","estimate":"30min","deps":["mc-01"],"prereqs":[]}
{"id":"mc-03","title":"Add package-level memory metadata","type":"implementation","status":"done","description":"Add persistence (bool), scope (private|shared|inherited), consolidation (bool) to ToolPackage metadata type. Update derived prompt generation to reflect memory metadata (e.g., persistence:false → 'no persistent memory'). TDD.","estimate":"30min","deps":["mc-02"],"prereqs":[]}
{"id":"mc-04","title":"Implement NullMemory strategy","type":"implementation","status":"done","description":"Create NullMemory ToolPackage: tools:[], metadata populated (persistence:false, scope:private, consolidation:false), all contract operations are no-ops (recall→{capsules:[],truncated:false}, store→receipt, forget→void, consolidate→{pruned:0,promoted:0}). TDD.","estimate":"20min","deps":["mc-01"],"prereqs":[]}
{"id":"mc-05","title":"Conform KeywordMemory to new contract","type":"implementation","status":"done","description":"Update createKeywordMemoryPackage to implement full memory contract. recall gains opts (limit, threshold) and returns {capsules, truncated}. store gains operation-level meta. forget becomes fuzzy (query-based, not ref-based). consolidate accepts trigger enum and returns stats. Existing behavior preserved. TDD.","estimate":"45min","deps":["mc-03"],"prereqs":[]}
{"id":"mc-06","title":"Conform EmbeddingMemory to new contract","type":"implementation","status":"done","description":"Same as mc-05 but for createEmbeddingMemoryPackage. Embedding strategy: threshold maps to similarity floor, fuzzy forget uses embedding similarity. TDD.","estimate":"45min","deps":["mc-03"],"prereqs":[]}
{"id":"mc-07","title":"Shared contract tests for swappability","type":"test","status":"done","description":"Write contract test suite that all three strategies (Null, Keyword, Embedding) must pass. Tests: recall empty returns empty, store then recall finds it, forget then recall doesn't find it, consolidate returns valid stats, NullMemory tools array is empty, metadata fields present on all. Proves swappability. Run against all three.","estimate":"30min","deps":["mc-04","mc-05","mc-06"],"prereqs":[]}
{"id":"mc-08","title":"Wire consolidation as orchestrator lifecycle signal","type":"implementation","status":"done","description":"Orchestrator calls consolidate(session_end) at end of interaction. Reads consolidation:bool from memory ToolPackage metadata to decide whether to call. NullMemory skipped (consolidation:false). TDD.","estimate":"30min","deps":["mc-07"],"prereqs":[]}
{"id":"mc-09","title":"Validate memory presence at orchestrator construction","type":"implementation","status":"done","description":"Orchestrator (or future createAgentCore) validates that toolPackages includes at least one package with intent including 'memory'. Throws clear error if missing. This makes memory a construction-time invariant. TDD.","estimate":"20min","deps":["mc-08"],"prereqs":[]}
```
