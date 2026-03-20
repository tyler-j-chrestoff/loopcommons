# Story: Embedding Retrieval (Package B) + Admin API

**Persona**: As a user talking to the agent, I need semantic recall so that "outdoor activities" finds memories about hiking.

**Acceptance criteria**:
- Package B embeds memories at write time via OpenAI text-embedding-3-small (512 dims)
- Recall computes cosine similarity and blends with keyword score
- `vector` field on memory entries is backward-compatible (missing = keyword-only)
- Admin `GET /api/memory` endpoint shows current world-model state (auth-gated)
- Swappability proven: tests show Package A, Package B, and A+B all satisfy ToolPackage
- Red-team: adversarial embedding queries don't create new attack surface
- Embedding cost tracked in spend tracker

## Tasks

```jsonl
{"id":"emb-01","title":"Add vector field to memory schema","type":"implementation","status":"done","description":"Extend Memory schema with optional vector: number[] field. Backward-compatible — existing memories without vectors still work. Update serialization/deserialization. TDD.","estimate":"30min","deps":["pkg-04"],"prereqs":[]}
{"id":"emb-02","title":"Implement embedding strategy","type":"implementation","status":"done","description":"Create embedding recall strategy: embed() at memory_remember time (store vector), cosineSimilarity() at memory_recall time. Use Vercel AI SDK embed() with @ai-sdk/openai text-embedding-3-small, 512 dimensions. Blend scores: 0.6 * semantic + 0.4 * keyword (keyword = fraction of query words matched). TDD with mocked embed().","estimate":"90min","deps":["emb-01"],"prereqs":["OPENAI_API_KEY env var for embedding model"]}
{"id":"emb-03","title":"Package B factory","type":"implementation","status":"done","description":"createEmbeddingMemoryPackage(config) — same ToolPackage interface as Package A but uses embedding strategy. Config accepts embeddingModel override. TDD: contract tests, swap tests.","estimate":"45min","deps":["emb-02"]}
{"id":"emb-04","title":"Admin memory API","type":"implementation","status":"done","description":"GET /api/memory — returns world-model entries (paginated, filterable by type/tags). Auth-gated (admin session or X-API-Key). Sanitize any sensitive fields. TDD.","estimate":"45min","deps":["pkg-05"]}
{"id":"emb-05","title":"Red-team embedding surface","type":"red-team","status":"done","description":"Test adversarial queries against embedding recall: can an attacker craft queries that surface memories they shouldn't see? Does embedding similarity create false matches on adversarial input? Verify threat gating still works with embedding strategy. Write red-team tests.","estimate":"45min","deps":["emb-03"]}
```
