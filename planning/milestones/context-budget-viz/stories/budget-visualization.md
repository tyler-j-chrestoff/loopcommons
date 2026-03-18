# Story: Context Budget Visualization

> As a **visitor/researcher**, I want to see how my conversation consumes the model's context window in real-time — a persistent "fuel gauge" that makes the invisible cost of LLM conversations visible, with per-message breakdowns and threshold warnings.

## Acceptance Criteria

- `ContextBudgetBar` component shows fill level (% of 200K context used) as a persistent bar in the chat UI
- Per-message token breakdown on hover/click: input tokens, output tokens, cached tokens, source (amygdala vs. subagent)
- Cost overlay showing estimated $ spent on this conversation
- Visual threshold indicators at 75% (yellow), 90% (orange), 100% (red) with pulse animation at 90%+
- Handles streaming gracefully: shows estimate during generation, snaps to actual on completion
- Integrated into chat UI layout (below header, above messages)
- Works with existing dark theme (Tailwind CSS v4)

## Tasks

```jsonl
{"id":"ctx-07","story":"budget-visualization","description":"Extend client-side state in packages/web/src/lib/use-chat.ts to handle token budget SSE events. Add tokenBudget state: {turns: Array<{estimated, actual, source}>, cumulative: {promptTokens, completionTokens, cacheReadTokens}, budgetPercent: number, costEstimate: number, isStreaming: boolean}. Parse token-budget:start (set isStreaming=true, update estimate) and token-budget:complete (set isStreaming=false, update actuals). Export tokenBudget from the hook.","depends_on":["ctx-04"],"status":"pending"}
{"id":"ctx-08","story":"budget-visualization","description":"Build ContextBudgetBar component in packages/web/src/components/ContextBudgetBar.tsx. Horizontal bar showing context fill level with smooth CSS transitions. Shows: fill bar (gradient from green to yellow to red based on %), percentage label, token count (e.g. '42K / 200K'). During streaming, bar animates with a shimmer effect on the leading edge. At 75% threshold, bar turns yellow; at 90%, orange with subtle pulse; at 100%, red. Use Tailwind CSS v4 classes, dark theme compatible.","depends_on":["ctx-07"],"status":"pending"}
{"id":"ctx-09","story":"budget-visualization","description":"Build per-message token breakdown popover in packages/web/src/components/TokenBreakdown.tsx. On hover/click of a message, shows a small card with: input tokens, output tokens, cached tokens (with cache hit indicator), amygdala overhead tokens, cost for this turn. Use existing Tailwind popover/tooltip pattern. Data comes from tokenBudget.turns array matched by turn index.","depends_on":["ctx-07"],"status":"pending"}
{"id":"ctx-10","story":"budget-visualization","description":"Add cost overlay to ContextBudgetBar. Small secondary label showing cumulative conversation cost (e.g. '$0.0032'). Formatted to significant digits (show 4 decimal places for sub-cent costs, 2 for larger). Uses costEstimate from tokenBudget state. Tooltip on hover explains the calculation (input rate, output rate, cache discount).","depends_on":["ctx-08"],"status":"pending"}
{"id":"ctx-11","story":"budget-visualization","description":"Integrate ContextBudgetBar into packages/web/src/components/Layout.tsx. Position below the chat header, above the message list. Sticky positioning so it stays visible during scroll. Conditionally rendered (only after first token-budget event received). Ensure it does not shift layout of existing components (AmygdalaInspector, messages, input). Pass tokenBudget state from use-chat hook.","depends_on":["ctx-08"],"status":"pending"}
{"id":"ctx-12","story":"budget-visualization","description":"Component tests in packages/web/test/context-budget-bar.test.ts. Test ContextBudgetBar: renders correct percentage, threshold color changes (green/yellow/orange/red), streaming shimmer state, token count formatting (K suffix for thousands). Test TokenBreakdown: renders per-turn data, cache indicator, cost formatting. Test use-chat token budget state updates from mock SSE events. Use Vitest + testing patterns from existing web tests.","depends_on":["ctx-08","ctx-09"],"status":"pending"}
```
