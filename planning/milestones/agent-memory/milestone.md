# Milestone: Agent Memory (Persistent World Model)

**Status**: planned

## Summary

Give the agent a persistent self-model that survives across sessions and interfaces. Memory is exposed as **tools** (`memory_recall`, `memory_remember`) backed by a polymorphic `PersistentState` interface — not a bespoke subsystem. The web chat is the first consumer; the architecture works for any future interface without changes.

The theoretical foundation is documented in [`designs/tools-as-ontology.md`](designs/tools-as-ontology.md): an agent's identity is its tool composition (OOO), persistent state is a capability not infrastructure, and the system prompt is a lossy projection of capabilities into natural language. This milestone is Phase 1 of a 5-phase trajectory.

## Architecture

```
[interface: web | reddit | hn | phone | ...]
  │
  ▼
orchestrator
  ├── memory_recall tool → PersistentState.recall() → memoryContext for amygdala
  ├── amygdala(memoryContext + rawMessage) → classification + threat assessment
  ├── route to subagent (existing pipeline)
  └── memory_remember tool → PersistentState.remember() (gated by threat level)
        │
        ▼
PersistentState interface (packages/llm/src/memory/)
  ├── JsonFilePersistentState (v1 — JSON file on Railway volume)
  ├── [future] MmogitPersistentState (sovereign signed memory)
  ├── [future] EmbeddingPersistentState (vector similarity retrieval)
  └── [future] CompoundPersistentState (multi-backend)
```

## 5-Phase Trajectory (from tools-as-ontology.md)

1. **Agent Memory** ← this milestone. Persistent state as tool interface.
2. **Tools as Packages** — extract tools into standalone packages, enrich metadata.
3. **Derived System Prompts** — generate prompts from tool composition.
4. **Multi-Interface Identity** — agent on web + Reddit + CLI with shared memory.
5. **Evolutionary Agent Arena** — selection pressure over agent architectures.

Each phase is independently useful. Each enables the next.

## Verification Gate

- [ ] Theory doc (tools-as-ontology.md) validated against research findings
- [ ] `PersistentState` interface with `JsonFilePersistentState` implementation
- [ ] `createMemoryTools` factory producing `memory_recall` + `memory_remember` tools
- [ ] Memory tools in registry, scoped by orchestrator
- [ ] Orchestrator populates `memoryContext` via recall, gates writes by threat level
- [ ] Memory trace events (`memory:recall`, `memory:write`) in viz pipeline
- [ ] Memory inspector component in frontend
- [ ] Red-team: memory poisoning gated by threat assessment
- [ ] Cross-session continuity demonstrated

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [memory-research](stories/memory-research.md) | Tyler (researcher) | Research + design: validate tools-as-ontology theory, design type system, PersistentState interface, security model |
| [memory-core](stories/memory-core.md) | Tyler (researcher) | Build PersistentState + memory tools + orchestrator integration + viz + red-team |

## Design Documents

| Document | Status | Summary |
|----------|--------|---------|
| [tools-as-ontology.md](designs/tools-as-ontology.md) | Draft | Theory: tools define identity, persistent state as tool, derived prompts, 5-phase trajectory |
| [memory-architecture.md](designs/memory-architecture.md) | Planned (session 23) | Implementation design: prior art survey, type system, API, security analysis |
