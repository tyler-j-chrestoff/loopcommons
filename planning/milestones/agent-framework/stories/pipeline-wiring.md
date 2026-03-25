# Story: Pipeline Wiring + TestAdapter

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §6 Migration Map — Phase C wiring

## Why

ConflictMonitor and Consolidator need to be wired into the Router pipeline, and we need a programmatic second channel (TestAdapter) to integration-test cross-channel flows without external dependencies. This story also threads channelCapabilities through to the Orchestrator, completing a gap from Phase A.

## Acceptance Criteria

- channelCapabilities available on OrchestratorInput
- TestAdapter implements ChannelAdapter for programmatic testing
- Integration test: two adapters (Web + Test), ConflictMonitor detects cross-channel contradiction, Consolidator writes with provenance from both channels
- Full pipeline flow tested end-to-end with all Phase C subsystems
- All existing tests pass unchanged

## Tasks

```jsonl
{"id":"pw-01","title":"Thread channelCapabilities to Orchestrator","description":"Pass ChannelMessage.channel.capabilities through Router -> core.invoke -> OrchestratorInput. Add channelCapabilities field to OrchestratorInput type. Orchestrator can use it for tool scoping (future).","deps":[],"prereqs":[]}
{"id":"pw-02","title":"TestAdapter","description":"Implement TestAdapter: ChannelAdapter for type 'test'. Programmatic normalize/format, configurable capabilities. Used in integration tests to simulate a second channel without external deps.","deps":[],"prereqs":[]}
{"id":"pw-03","title":"Cross-channel integration tests","description":"End-to-end test: user sends message via WebAdapter, then via TestAdapter. ConflictMonitor receives memory context from both. Consolidator writes memories with correct provenance from each channel. Verify trace events from all subsystems.","deps":["cm-04","co-04","pw-01","pw-02"],"prereqs":[]}
```
