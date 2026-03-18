# Milestone: Context Window Budget Visualization

**Status**: done

## Summary

Build a novel, real-time context window budget visualization for the chat UI. No widely-used open-source tool does this — the closest prior art is Vercel AI Elements' Context component (a hover card for post-hoc inspection) and community plugins for OpenWebUI. This will be a first-class, always-visible element showing how the conversation consumes the model's context window.

This is both a user-facing feature (visitors see the "fuel gauge" of their conversation) and a research tool (observe how different interaction patterns consume context). Every data point is visualized per Rule #2.

## Research Findings

- **No widely-used implementation** of real-time in-chat context budget visualization exists
- **No academic treatment** of the UX concept found
- **Token counting**: Anthropic's `countTokens` API (pre-request, free, accurate) + `onFinish` usage metadata (post-response, canonical) — no accurate client-side tokenizer for Claude 3+
- **Prior art**: Vercel AI Elements Context component (hover card), tokentap (Python CLI), Claude Code `/context` command
- **Known challenge**: Token counts only available server-side; real-time viz requires combining pre-request estimates with post-response actuals

## Architecture

```
Token Flow:
  Pre-request:  Anthropic countTokens API → estimated input tokens
  During stream: Approximate output by chunk count (rough)
  Post-response: onFinish → { promptTokens, completionTokens } (accurate)

Cumulative tracking:
  Each turn: sum(promptTokens + completionTokens) → running total
  Budget: running total / model context limit (200K for Claude)

SSE events:
  token-budget:start  → estimated input for this turn
  token-budget:complete → actual usage for this turn + cumulative total

Viz component:
  ContextBudgetBar — persistent bar showing fill level, per-message breakdown on hover
```

## Verification Gate

- [x] Research: token counting approaches verified against live API
- [x] Server tracks cumulative token usage across conversation turns
- [x] Token budget data sent to client via SSE events
- [x] ContextBudgetBar component shows real-time fill level in chat UI
- [x] Per-message token breakdown accessible (hover or click)
- [x] Cost overlay (estimated $ spent on this conversation)
- [x] Visualization handles edge cases: tool calls, amygdala overhead, cached tokens
- [x] Component tested (unit + visual verification)

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [token-tracking](stories/token-tracking.md) | Tyler (researcher) | Build server-side token counting and cumulative tracking infrastructure |
| [budget-visualization](stories/budget-visualization.md) | Visitor / researcher | Interactive context budget component in chat UI |
