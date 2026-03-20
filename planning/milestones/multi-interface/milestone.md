# Milestone: Multi-Interface

**Status**: planned
**Sessions**: 2
**Stories**: 2
**Prerequisite**: derived-prompts

Agent operates on web + CLI with shared invocation contract. Prove tools are portable across interfaces.

## Key Decisions

- Extract the pipeline from route.ts (memory recall -> amygdala -> orchestrator -> session persistence) into a `createAgentCore()` factory returning `invoke(AgentInvocation): Promise<AgentInvocationResult>`.
- `AgentInvocation` type: message, conversationHistory, identity (interfaceId, userId, isAdmin), stream flag.
- Web route.ts becomes a thin HTTP adapter around `createAgentCore()`.
- CLI is the minimum viable second interface: stdin/stdout REPL, `--admin` flag, local memory file.
- Memory doesn't need to share across interfaces in real-time (CLI = local, web = Railway). Same capsule-shaped format, pipeline consolidates both.
- Rate limiting becomes pluggable (IP-based for web, spend-cap-only for CLI).

## Key Risks

- Session writer and rate limiter live in `packages/web` — need extraction or abstraction
- Streaming vs buffered output across interfaces
- Scope creep into external interfaces (Reddit/Discord) — explicitly deferred

## Verification Gate

- [ ] `createAgentCore()` factory exists with typed invocation contract
- [ ] Web route.ts is a thin adapter around `createAgentCore()`
- [ ] All existing web tests pass unchanged
- [ ] Session events include `interfaceId`
- [ ] CLI REPL can hold a full conversation
- [ ] CLI uses `createAgentCore()`, local memory path, JSONL session output
- [ ] `--admin` flag for blog write access
- [ ] Pipeline consolidates CLI sessions alongside web sessions
- [ ] Red-team: CLI can't escalate beyond auth level

## Files

`packages/web/src/app/api/chat/route.ts` (extract from), `packages/llm/src/orchestrator/index.ts`, `packages/web/src/lib/session/file-session-writer.ts` (make portable)
