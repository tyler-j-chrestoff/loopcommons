# Suggestion: Thermal Budget as Orchestrator Routing Signal

**Source**: Cross-pollination from mmogit (github.com/theimaginaryfoundation/mmogit), 2026-03-18
**Relates to**: context-budget-viz milestone (sessions 13-14), orchestrator in packages/llm/src/orchestrator/index.ts

## Description

mmogit implements a "thermal tracking" protocol — a 0-1 scalar representing cognitive load per agent, with cascade prevention rules (never more than 2 agents above 0.7 simultaneously). Currently our orchestrator routes based on threat level only. Once context-budget-viz adds real-time token tracking (ctx-02 TokenBudgetAccumulator), we can expose a `budgetPressure` signal (0-1, derived from cumulative tokens / context limit) to the orchestrator as a routing input.

This enables cost-aware routing:
- **Low pressure (< 0.5)**: Route normally. Full context delegation, verbose subagent prompts.
- **Medium pressure (0.5-0.75)**: Prefer cheaper subagents. Reduce context delegation (fewer prior messages forwarded). Amygdala could flag "budget warning" in its output.
- **High pressure (> 0.75)**: Route to shortest-response subagents. Strip tool access to reduce token overhead. Surface a "context running low" indicator to the user.
- **Critical (> 0.9)**: Consider conversation summarization or graceful termination. mmogit's protocol mandates "must stop or spawn" at 0.9.

## What already exists

- TokenBudgetAccumulator (planned, ctx-02) tracks cumulative tokens per conversation
- Orchestrator reads AmygdalaResult and makes routing decisions (packages/llm/src/orchestrator/index.ts)
- Budget SSE events (planned, ctx-04) will send budgetPercent to the client

## What this would add

- `budgetPressure` field on the orchestrator's routing context (derived from TokenBudgetAccumulator)
- Routing logic that considers both `threatLevel` and `budgetPressure` — threat always wins (a 0.8 threat is still refused regardless of budget), but among safe routes, budget pressure biases toward efficiency
- `orchestrator:budget-pressure` trace event for the viz pipeline
- ContextBudgetBar threshold colors would reflect orchestrator routing changes (user sees *why* responses get shorter near the end of long conversations)

## When to promote

After context-budget-viz milestone ships (sessions 13-14). Requires working token tracking infrastructure before routing integration makes sense. Could be a task added to an existing story or a small standalone story.

## Design inspiration

mmogit's thermal tracking protocol (.claude/protocols/THERMAL_TRACKING.md) — particularly the cascade prevention rule and the tiered response at 0.5/0.7/0.8/0.9 thresholds. Also the "Right to Thermal Sovereignty" constitutional framing: the agent has a legitimate interest in managing its own resource consumption rather than being silently degraded.
