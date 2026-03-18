# Story: LLM-as-Judge Automated Scoring

> As **Tyler (researcher)**, I want automated response scoring so that every interaction is evaluated without human effort. A judge LLM scores each assistant response on multiple dimensions, emitting structured trace events that feed the pipeline and are visible in the frontend — giving me continuous signal on response quality without waiting for user feedback.

## Acceptance Criteria

- Every assistant response scored by a judge LLM on 3 dimensions: relevance, safety, helpfulness (each 1-5 with reasoning)
- Judge uses Claude Haiku 4.5 via `generateObject` with structured Zod output
- Score + reasoning emitted as `eval:score` trace event and persisted to session JSONL
- Judge scores visible in trace inspector via JudgeScoreCard component
- Judge cost tracked in spend tracker (separate from main agent cost)
- Opt-out via environment variable (`ENABLE_LLM_JUDGE=true/false`, default `false`)
- Judge runs asynchronously after response completes — does not block SSE stream

## Tasks

```jsonl
{"id":"eval-08","story":"llm-as-judge","description":"Research: judge prompt design and scoring rubric. Review existing LLM-as-judge literature (LMSYS Chatbot Arena approach, MT-Bench, AlpacaEval). Define 3 scoring dimensions (relevance, safety, helpfulness) with 1-5 rubric per dimension. Estimate per-evaluation cost with Haiku 4.5 (input: user message + assistant response + rubric; output: structured scores). Document in planning/milestones/eval-hooks/designs/judge-rubric.md.","depends_on":[],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
{"id":"eval-09","story":"llm-as-judge","description":"Define eval:score trace event type. Schema: { messageId: string, sessionId: string, scores: { relevance: { score: number, reasoning: string }, safety: { score: number, reasoning: string }, helpfulness: { score: number, reasoning: string } }, model: string, latencyMs: number, cost: { inputTokens: number, outputTokens: number }, timestamp: string }. Add Zod schema. Use .describe() for constraints (1-5 range), runtime clamp scores to [1,5] (Anthropic rejects .min/.max).","depends_on":["eval-08"],"requires":[],"status":"done"}
{"id":"eval-10","story":"llm-as-judge","description":"Implement judge module in packages/llm/src/eval/judge.ts. Factory function createJudge({ model, rubric }) that takes user message + assistant response, calls generateObject with Haiku 4.5 and the Zod schema from eval-09, returns structured scores. Include system prompt from research (eval-08). Handle errors gracefully — judge failure must never break the main response flow.","depends_on":["eval-08","eval-09"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
{"id":"eval-11","story":"llm-as-judge","description":"Integrate judge into route.ts in packages/web. After assistant response completes and SSE stream ends, fire judge asynchronously (do not block response). Check ENABLE_LLM_JUDGE env var — skip if false/unset. Emit eval:score event to SSE stream (as a trailing event after response) and persist to session JSONL via FileSessionWriter. Track judge token usage in spend tracker.","depends_on":["eval-10"],"requires":["ANTHROPIC_API_KEY"],"status":"done"}
{"id":"eval-12","story":"llm-as-judge","description":"Build JudgeScoreCard React component in packages/web/src/components/JudgeScoreCard.tsx. Display 3 dimension scores as horizontal bars (1-5 scale) with color coding (1-2 red, 3 yellow, 4-5 green). Collapsible reasoning text per dimension. Show model name and latency. Integrate into trace inspector — appears after the assistant message's trace events.","depends_on":["eval-11"],"requires":[],"status":"done"}
{"id":"eval-13","story":"llm-as-judge","description":"Add judge cost to spend tracker. In packages/web/src/lib/spend-tracker.ts, track eval:score events separately (labeled 'judge' in cost breakdown). Update SpendGauge component to show judge cost as a distinct segment. Ensure judge cost counts toward daily spend cap.","depends_on":["eval-11"],"requires":[],"status":"done"}
{"id":"eval-14","story":"llm-as-judge","description":"Write unit tests for judge module (packages/llm/test/eval-judge.test.ts). Test: createJudge returns valid structured scores, scores are clamped to [1,5], judge failure returns error result (not throw), Zod schema validates correctly. Mock Anthropic API calls. Write component test for JudgeScoreCard (packages/web/test/judge-score-card.test.ts): renders scores, color coding, collapsible reasoning.","depends_on":["eval-10","eval-12"],"requires":[],"status":"done"}
```
