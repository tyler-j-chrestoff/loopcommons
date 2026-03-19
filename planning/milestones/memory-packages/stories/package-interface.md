# Story: Package Interface + Extraction (Package A)

**Persona**: As the agent architect, I need a ToolPackage interface so that memory implementations are swappable without touching the orchestrator.

**Acceptance criteria**:
- `ToolPackage` interface defined and exported from `packages/llm`
- Memory extracted to `packages/memory` as an npm workspace package
- `packages/memory` exports a factory that returns a `ToolPackage`
- route.ts consumes memory through the package interface (no direct `createMemoryTools`/`createJsonFilePersistentState` imports)
- All 93 existing memory tests pass against the extracted package
- Contract tests prove any object satisfying `ToolPackage` can be wired in

## Tasks

```jsonl
{"id":"pkg-01","title":"Research: embedding API + package patterns","type":"research","description":"Verify Vercel AI SDK embed() API, OpenAI text-embedding-3-small pricing/dims/latency, npm workspace package extraction patterns. Check if @ai-sdk/openai can be used for embeddings only while keeping Anthropic for chat.","estimate":"30min","deps":[],"prereqs":["Web access for API docs"]}
{"id":"pkg-02","title":"Define ToolPackage interface","type":"implementation","description":"Define ToolPackage interface in packages/llm/src/tool/: tools (ToolDefinition[]), formatContext() for amygdala injection, metadata (name, capabilities). Keep it minimal — don't over-abstract. TDD: write contract tests first.","estimate":"45min","deps":["pkg-01"]}
{"id":"pkg-03","title":"Extract packages/memory workspace","type":"implementation","description":"Create packages/memory as npm workspace. Move memory types, PersistentState, JsonFilePersistentState, memory tools, matchesQuery, isContradiction, consolidation from packages/llm. Update imports in packages/llm and packages/web. All existing tests must pass.","estimate":"90min","deps":["pkg-02"]}
{"id":"pkg-04","title":"Implement keyword strategy as Package A","type":"implementation","description":"Wrap extracted memory code as a ToolPackage factory: createKeywordMemoryPackage(config). Returns tools + formatContext + metadata. Config accepts filePath, getThreatScore. TDD.","estimate":"45min","deps":["pkg-03"]}
{"id":"pkg-05","title":"Wire route.ts through package interface","type":"implementation","description":"Replace direct createMemoryTools/createJsonFilePersistentState in route.ts with package consumption. Orchestrator receives tools from package. Memory recall for amygdala uses package.formatContext(). Verify SSE events still emit correctly.","estimate":"45min","deps":["pkg-04"]}
```
