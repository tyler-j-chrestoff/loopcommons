# Milestone: Memory Packages

**Status**: Active
**Sessions**: 2 planned (29–30)
**Theme**: Memory as the pilot for composable tool packages

## Why

The tools-as-ontology thesis says tools define agent identity: `A(soul, tools) = system_prompt`. If that's true, then memory isn't infrastructure — it's a composable capability. An agent with embedding-based memory is a *different kind of agent* than one with keyword memory, even with the same soul document.

Memory is the ideal pilot for tool-package extraction because:
- It's the most complex tool we have (state, gating, recall scoring, persistence)
- It has a real quality bug motivating the work (substring matching → tokenized → embeddings)
- It directly enables the evolutionary arena (spawn agents with different memory compositions, measure fitness)
- If the package pattern works for memory, it works for everything

## Stories

- [package-interface](stories/package-interface.md) — Define ToolPackage contract, extract Package A
- [embedding-recall](stories/embedding-recall.md) — Semantic retrieval (Package B), admin API, swappability proof

## Architecture

```
packages/memory/
  src/
    index.ts          — ToolPackage interface + factory
    strategies/
      keyword.ts      — Package A: JSON + tokenized word matching
      embedding.ts    — Package B: JSON + OpenAI embeddings + cosine similarity
    state/
      json-file.ts    — Current JsonFilePersistentState (extracted from packages/llm)
    tools.ts          — memory_recall + memory_remember (extracted from packages/llm)
    types.ts          — Memory, MemoryInput, RecallQuery, etc.
```

```
ToolPackage interface:
  tools: ToolDefinition[]           — tools to register
  formatContext(): string           — inject into amygdala prompt
  metadata: { name, capabilities, cost }
```

The orchestrator and route.ts consume memory through the package interface. Swapping strategies is a config change, not a code change.

## Dependencies

- Vercel AI SDK `embed()` + `cosineSimilarity()` (built-in)
- OpenAI `text-embedding-3-small` (512 dims, $0.02/1M tokens) — for Package B only
- `@ai-sdk/openai` provider package — embeddings only (chat stays Anthropic)

## Connects to

- **Tools-as-Ontology Phase 2** — this IS Phase 2, scoped to memory as the pilot
- **Evolutionary Agent Arena** — composable memory enables spawning agents with different memory fitness
- **Multi-Interface Identity** — package interface is interface-agnostic by design
