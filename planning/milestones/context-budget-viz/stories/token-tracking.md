# Story: Server-Side Token Tracking

> As **Tyler (researcher)**, I want server-side token counting so that every conversation's context budget is tracked accurately — enabling real-time visualization, cost attribution, and research into how different interaction patterns consume the 200K context window.

## Acceptance Criteria

- Server tracks cumulative token usage (input + output) per conversation across turns
- Anthropic `countTokens` API used for pre-request estimates (including system prompt, tools, message history)
- `onFinish` usage metadata captured for accurate post-response totals (promptTokens, completionTokens, cacheReadTokens, cacheCreationTokens)
- Token budget SSE events sent to client: `token-budget:start` (pre-request estimate), `token-budget:complete` (actual usage + cumulative)
- Amygdala + orchestrator overhead tokens included in budget (not just subagent tokens)
- Cached token discount reflected in cost calculation (cache reads are 10% of input cost for Anthropic)
- Multi-turn accumulation: cumulative totals persist across the full conversation

## Tasks

```jsonl
{"id":"ctx-01","story":"token-tracking","description":"Research: verify Anthropic countTokens API behavior. Test with: (1) system prompts, (2) tool definitions in the request, (3) multi-turn message history, (4) cached tokens. Confirm countTokens is free and returns accurate pre-request estimates. Document how cacheReadTokens and cacheCreationTokens appear in onFinish usage. Check if countTokens counts tool_result messages correctly. Record findings in a design comment in this file.","depends_on":[],"requires":["ANTHROPIC_API_KEY in .env"],"status":"done"}
{"id":"ctx-02","story":"token-tracking","description":"Implement TokenBudgetAccumulator in packages/web/src/lib/token-budget.ts. Tracks per-turn and cumulative token usage for one conversation. Fields: turns (array of {turnIndex, estimated: {inputTokens}, actual: {promptTokens, completionTokens, cacheReadTokens, cacheCreationTokens}, source: 'amygdala'|'orchestrator'|'subagent'}), cumulative totals, modelContextLimit (200000). Methods: addEstimate(source, inputTokens), addActual(source, usage), getCumulative(), getBudgetPercent(), getCostEstimate(). Cost calc uses existing model-aware pricing from packages/llm with cached token discount (cache reads at 10% input cost).","depends_on":["ctx-01"],"status":"done"}
{"id":"ctx-03","story":"token-tracking","description":"Integrate TokenBudgetAccumulator into packages/web/src/app/api/chat/route.ts. Create accumulator per request. Call countTokens before amygdala invocation and before subagent invocation to get pre-request estimates. Capture onFinish usage from amygdala (generateObject), orchestrator, and subagent (streamText) calls. Accumulator tracks all three sources separately. Wire up to existing spend-tracker for cost attribution.","depends_on":["ctx-02"],"status":"done"}
{"id":"ctx-04","story":"token-tracking","description":"Add SSE events for token budget data. Emit token-budget:start after countTokens (contains estimated input tokens for this turn, cumulative estimate, budgetPercent). Emit token-budget:complete in onFinish callback (contains actual usage breakdown, cumulative totals, budgetPercent, costEstimate). Follow existing SSE event pattern (sendEvent helper in route.ts). Include amygdala overhead as a separate field so the viz can show pipeline cost vs. subagent cost.","depends_on":["ctx-03"],"status":"done"}
{"id":"ctx-05","story":"token-tracking","description":"Handle edge cases: (1) tool call tokens — countTokens must include tool definitions and tool_result messages in history, (2) amygdala overhead — generateObject token usage captured even though it's not streaming, (3) multi-turn accumulation — cumulative totals must account for growing message history across turns within one SSE connection, (4) error/timeout turns still record partial usage. Add runtime clamping so budgetPercent never exceeds 100.","depends_on":["ctx-03"],"status":"done"}
{"id":"ctx-06","story":"token-tracking","description":"Unit tests for TokenBudgetAccumulator in packages/web/test/token-budget.test.ts. Test: addEstimate/addActual tracking, cumulative totals across multiple turns, budgetPercent calculation, cost estimation with and without cached tokens, multi-source tracking (amygdala vs subagent), edge cases (zero tokens, missing fields, budget overflow clamping). Mock Anthropic usage shape.","depends_on":["ctx-02"],"status":"done"}
```
