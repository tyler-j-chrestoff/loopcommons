# Story: Router Extraction — Channel Normalization Layer

**Persona**: As an agent that needs to serve people on whichever channel they already use, I need a Router that normalizes channel-specific messages into a canonical format, so my core pipeline doesn't know or care whether a message came from web, CLI, Discord, or SMS.

**Status**: planned

**Traces to**: brain-architecture.md §1 (Canonical Message Format), §2.1 (Router), §6 (Migration Map — Phase A)

**Context**: The current architecture has channel-specific logic embedded in callers (`route.ts` assembles tool packages + identity, `chat.ts` does the same for CLI). The Router extraction moves normalization into a dedicated subsystem with a `ChannelAdapter` interface, making multi-channel a configuration change rather than a code change. `createAgentCore` becomes an internal implementation detail — external callers go through the Router.

**Acceptance criteria**:
- `ChannelMessage` and `ChannelResponse` types defined per §1 of design doc
- `ChannelAdapter` interface defined with `normalize()`, `format()`, and `capabilities`
- `WebAdapter` extracts channel normalization from `route.ts`
- `CliAdapter` extracts channel normalization from `chat.ts`
- `Router` wraps `createAgentCore` — callers pass raw channel input, Router normalizes and dispatches
- Thread/history management moves into Router (callers no longer pass `conversationHistory`)
- All existing web + CLI tests pass with no behavior change
- New unit tests for Router, WebAdapter, CliAdapter
- `route.ts` and `chat.ts` become thin callers into Router

## Tasks

```jsonl
{"id":"re-01","title":"Define ChannelMessage, ChannelResponse, and ChannelAdapter types","type":"code","status":"planned","description":"Create packages/llm/src/router/types.ts with the canonical message format from design doc §1. ChannelMessage (id, channel, user, thread, content, timestamp), ChannelResponse (messageId, content, trace, usage, cost, subagentId, guardianAssessment), ChannelOrigin, ChannelCapabilities, UserRef, ThreadRef, MessageContent, Attachment, ChannelAdapter interface. Red-green: write type tests that verify the interfaces compile and are structurally compatible with existing AgentInvocation/AgentInvocationResult.","estimate":"25min","deps":[],"prereqs":[]}
{"id":"re-02","title":"Build WebAdapter — extract normalization from route.ts","type":"code","status":"planned","description":"Create packages/llm/src/router/adapters/web.ts implementing ChannelAdapter. normalize() converts HTTP request shape (message string, conversationHistory, identity) into ChannelMessage. format() converts ChannelResponse back to the SSE/JSON shape route.ts currently returns. Red-green: test normalize round-trips with existing route.ts test fixtures. Capabilities: streaming=true, attachments=false, threads=true, formatting=markdown.","estimate":"30min","deps":["re-01"],"prereqs":[]}
{"id":"re-03","title":"Build CliAdapter — extract normalization from chat.ts","type":"code","status":"planned","description":"Create packages/llm/src/router/adapters/cli.ts implementing ChannelAdapter. normalize() converts CLI input (stdin line + session state) into ChannelMessage. format() converts ChannelResponse to terminal output. Red-green: test normalize produces valid ChannelMessage from CLI input shapes. Capabilities: streaming=true, attachments=false, threads=true, formatting=markdown.","estimate":"20min","deps":["re-01"],"prereqs":[]}
{"id":"re-04","title":"Build Router — wraps createAgentCore with adapter dispatch","type":"code","status":"planned","description":"Create packages/llm/src/router/index.ts. Router factory takes RouterConfig (adapters + pipeline config). Router.process() takes raw input + channelType, dispatches to correct adapter's normalize(), calls createAgentCore.invoke() with the normalized input, then calls adapter.format() on the result. Thread/history management: Router maintains per-thread history (in-memory Map for now, same data as callers currently pass). Red-green: test Router.process() with WebAdapter produces same result as direct createAgentCore.invoke() for equivalent input.","estimate":"40min","deps":["re-02","re-03"],"prereqs":[]}
{"id":"re-05","title":"Wire route.ts through Router","type":"code","status":"planned","description":"Refactor packages/web/src/app/api/chat/route.ts to instantiate Router with WebAdapter and delegate to Router.process(). Remove channel-specific normalization logic from route.ts — it becomes a thin HTTP handler that reads the request and passes raw input to Router. Verify all existing web tests pass unchanged. Trace event handling and SSE streaming must continue working.","estimate":"30min","deps":["re-04"],"prereqs":[]}
{"id":"re-06","title":"Wire chat.ts through Router","type":"code","status":"planned","description":"Refactor packages/web/scripts/chat.ts to instantiate Router with CliAdapter and delegate to Router.process(). Remove channel-specific normalization logic. Verify CLI chat still works (manual smoke test + any existing CLI tests).","estimate":"20min","deps":["re-04"],"prereqs":[]}
{"id":"re-07","title":"Export Router from @loopcommons/llm","type":"code","status":"planned","description":"Add router exports to packages/llm/src/index.ts. Export Router factory, ChannelAdapter, ChannelMessage, ChannelResponse, and adapter implementations. Verify no circular dependencies. Update package.json exports map if needed (sub-path @loopcommons/llm/router).","estimate":"10min","deps":["re-04"],"prereqs":[]}
{"id":"re-08","title":"Red-team: Router doesn't leak channel internals","type":"test","status":"planned","description":"Write tests verifying: (1) ChannelMessage.content never contains raw HTTP headers or channel metadata, (2) ChannelResponse formatted for web doesn't leak CLI-specific fields and vice versa, (3) Router rejects unknown channelType, (4) malformed raw input produces a clean error, not a crash. This is security surface — the Router is the new outermost boundary.","estimate":"20min","deps":["re-05","re-06"],"prereqs":[]}
```
