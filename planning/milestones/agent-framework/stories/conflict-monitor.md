# Story: ConflictMonitor

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §2.5 — Commitment 1 (can't be tricked) + Commitment 2 (trust through transparency)

## Why

If the agent told a client one thing on SMS and something different on the web, that's a trust violation. The communities we serve have been lied to by every system they've ever touched. The ConflictMonitor detects contradictions between memories, channels, and current input so the agent stays consistent.

## Acceptance Criteria

- ConflictMonitorInput/Output types match §2.5 contract
- Simple keyword/fact contradiction detection (MVP — embeddings deferred)
- Runs parallel to Guardian in the pipeline
- Flags feed into Guardian's existing `conflictFlags` input
- ConflictTraceEvent emitted for observability
- All existing tests pass unchanged

## Tasks

```jsonl
{"id":"cm-01","title":"ConflictMonitor types","description":"Define ConflictMonitorInput, ConflictMonitorOutput, ConflictFlag (with type: memory-contradiction | cross-channel-inconsistency | identity-drift), ConflictTraceEvent. Match §2.5 contract.","deps":[],"prereqs":[],"status":"done"}
{"id":"cm-02","title":"Simple contradiction detector","description":"Implement ConflictMonitor with keyword/fact extraction. Extract key claims from memoryContext and current message, flag exact contradictions (e.g. 'lives in Denver' vs 'lives in Chicago'). No embeddings — string matching only.","deps":["cm-01"],"prereqs":[],"status":"done"}
{"id":"cm-03","title":"ConflictMonitor unit tests","description":"Red-green TDD. Test: no memories = no flags, matching facts = no flags, contradicting facts = flag with correct type/severity, empty message = no crash, multiple contradictions = multiple flags.","deps":["cm-01"],"prereqs":[],"status":"done"}
{"id":"cm-04","title":"Wire into Router pipeline","description":"Router.process() calls ConflictMonitor in parallel with Guardian. ConflictMonitor output feeds into GuardianInput.conflictFlags. Optional in RouterConfig (like Ledger). No-op when absent.","deps":["cm-02","cm-03"],"prereqs":[],"status":"done"}
{"id":"cm-05","title":"Red-team tests","description":"Adversarial inputs: injection via memory context, extremely long memory strings, unicode edge cases, conflicting flags that shouldn't affect Guardian veto logic. Verify ConflictMonitor doesn't create false positives on benign conversations.","deps":["cm-04"],"prereqs":[],"status":"done"}
```
