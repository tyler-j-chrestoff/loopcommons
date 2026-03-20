# Milestone: Derived Prompts

**Status**: planned
**Sessions**: 2
**Stories**: 2
**Prerequisite**: tool-packages

Generate system prompts from tool composition + authored domain knowledge. Subagent prompts never drift from tool reality.

## Key Decisions

- `deriveCapabilities(tools: ToolDefinition[]): string` — pure function, generates markdown capability list from tool descriptions.
- `deriveBoundaries(allowlist, allToolNames): string` — generates "you cannot..." section from excluded tools.
- Hybrid model: `buildSystemPrompt()` assembles base + authored domain knowledge + derived capabilities + derived boundaries + annotations.
- SubagentConfig.systemPrompt trimmed to authored domain knowledge only (framing, personality, constraints). Capability descriptions removed (now derived).
- Security subagent: 100% authored (no tools = nothing to derive). Refusal: unchanged (static, no LLM call).
- No dynamic regeneration this milestone. Prompts derived once at subagent selection time.

## Verification Gate

- [x] `deriveCapabilities()` and `deriveBoundaries()` pure functions exist and are tested
- [x] SubagentConfig.systemPrompt trimmed to domain knowledge only
- [x] `buildSystemPrompt()` assembles hybrid prompts
- [x] Prompt equivalence tests: derived prompts contain all capability info
- [ ] All 152 CI eval tests pass
- [ ] Live eval suite shows no regression
- [ ] `promptSource` field on OrchestratorRouteEvent ('derived' | 'static' | 'hybrid')
- [ ] Red-team: derived prompts don't leak tool metadata implementation details
- [ ] Functions exported for calibration system access

## Files

`packages/llm/src/orchestrator/index.ts`, `packages/llm/src/subagent/registry.ts`, `packages/llm/src/tool/index.ts`
