# Story: Extract Agent Core (Invocation Contract)

**Persona**: As a developer adding a new interface, I want a single function that runs the full pipeline, so I don't need to re-implement amygdala + orchestrator wiring.

**Status**: done

**Acceptance criteria**:
- `createAgentCore()` in `packages/llm` (or new `packages/agent`)
- Web route.ts refactored to use it (thin adapter)
- All existing web tests pass unchanged
- Session events include `interfaceId`

## Tasks

```jsonl
{"id":"mi-01","title":"Define AgentInvocation and AgentInvocationResult types","type":"implementation","status":"done","description":"Define typed invocation contract: AgentInvocation (message, conversationHistory, identity: { interfaceId, userId, isAdmin }, stream flag) and AgentInvocationResult (response, traceEvents, usage, cost). TDD.","estimate":"30min","deps":[],"prereqs":["derived-prompts milestone complete"]}
{"id":"mi-02","title":"Extract pipeline into createAgentCore() factory","type":"implementation","status":"done","description":"Move the memory-recall -> amygdala -> orchestrator -> session-persistence pipeline from route.ts into a createAgentCore() factory. Accepts config (amygdala, orchestrator, toolPackages, sessionWriter). Returns invoke(AgentInvocation). TDD.","estimate":"90min","deps":["mi-01"],"prereqs":[]}
{"id":"mi-03","title":"Refactor route.ts as thin HTTP adapter","type":"implementation","status":"done","description":"Replace route.ts pipeline code with calls to createAgentCore().invoke(). Route.ts handles only HTTP concerns: auth, rate limiting, SSE streaming, request parsing. All existing web tests must pass.","estimate":"60min","deps":["mi-02"],"prereqs":[]}
{"id":"mi-04","title":"Add interfaceId to session events","type":"implementation","status":"done","description":"Add interfaceId field to session:start event. Web adapter sets 'web', CLI will set 'cli'. Update FileSessionWriter and session types.","estimate":"20min","deps":["mi-02"],"prereqs":[]}
{"id":"mi-05","title":"Make session writer and rate limiter portable","type":"implementation","status":"done","description":"Extract FileSessionWriter to a shared location (or make it configurable). Rate limiting becomes pluggable: IP-based for web, spend-cap-only for CLI.","estimate":"45min","deps":["mi-02"],"prereqs":[]}
```
