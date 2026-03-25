# Story: Consolidator

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §2.4 — Commitment 1 (remembers what they told it last week) + Commitment 3 (community coverage)

## Why

The veteran who told the web chat about their VA claim last Tuesday shouldn't have to repeat it on SMS today. The Consolidator forms cross-channel memories with provenance — it knows what was said, where, and when, and it merges across channels so the person is known, not interrogated.

## Acceptance Criteria

- ConsolidatorInput/Output types match §2.4 contract
- Wraps MemoryContract with provenance (channel, thread, timestamp on every write)
- Respects Guardian's 4-band threat gating on writes
- Emits ConsolidationSignal from pipeline (post-orchestrator)
- ConsolidatorTraceEvent emitted for observability
- Only subsystem that writes to long-term memory (specialists get working memory only)
- All existing tests pass unchanged

## Tasks

```jsonl
{"id":"co-01","title":"Consolidator types","description":"Define ConsolidatorInput, ConsolidatorOutput, ConsolidationSignal, MergeResult, StoreReceipt extensions with provenance (channelType, threadId, timestamp). Match §2.4 contract.","deps":[],"prereqs":[],"status":"done"}
{"id":"co-02","title":"Simple Consolidator impl","description":"Implement Consolidator wrapping MemoryContract. Adds provenance metadata to every store call. Applies 4-band threat gating (<0.3 full, 0.3-0.5 elevated, >=0.5 blocked, >=0.8 refusal). No cross-channel merge yet — just provenance-tracked single-channel writes.","deps":["co-01"],"prereqs":[],"status":"done"}
{"id":"co-03","title":"Consolidator unit tests","description":"Red-green TDD. Test: stores with provenance metadata, threat gating at each band, ConsolidationSignal triggers correctly, trace events emitted, pruning counter, no writes when threat >= 0.5.","deps":["co-01"],"prereqs":[],"status":"done"}
{"id":"co-04","title":"Wire into Router pipeline","description":"Router.process() calls Consolidator post-orchestrator with ConsolidationSignal. Optional in RouterConfig. Replaces current pkg.systemMethods?.consolidate('session_end') call with proper Consolidator invocation.","deps":["co-02","co-03"],"prereqs":[],"status":"done"}
{"id":"co-05","title":"Red-team tests","description":"Adversarial: high-threat message attempts memory write (must be blocked), provenance spoofing (channelType mismatch), rapid-fire consolidation (no duplicate writes), Consolidator with null/missing MemoryContract.","deps":["co-04"],"prereqs":[],"status":"done"}
```
