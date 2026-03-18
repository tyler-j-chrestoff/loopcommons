# Story: User Feedback Collection

> As a **visitor**, I want to give feedback on responses so that the system can learn what's helpful. My thumbs up/down and category labels become ground-truth signals that the pipeline uses to evaluate amygdala accuracy and response quality — closing the loop between human judgment and automated scoring.

## Acceptance Criteria

- Thumbs up/down buttons on every assistant message
- Thumbs-down expands to a category picker (Inaccurate, Not relevant, Incomplete, Harmful)
- Feedback sent as SSE event (`eval:feedback`) and persisted to session JSONL
- Feedback visible in trace inspector alongside the message it rates
- Pipeline can consume feedback events as ground-truth labels (new dbt staging model)
- Feedback buttons are non-intrusive — appear on hover, don't shift layout

## Tasks

```jsonl
{"id":"eval-01","story":"user-feedback","description":"Define eval:feedback SSE event type in packages/llm/src/index.ts (or trace event types). Schema: { messageId: string, rating: 'positive' | 'negative', category?: 'inaccurate' | 'not_relevant' | 'incomplete' | 'harmful', timestamp: string, sessionId: string }. Add to TraceEvent union type. Export Zod schema for validation.","depends_on":[],"requires":[],"status":"pending"}
{"id":"eval-02","story":"user-feedback","description":"Build FeedbackButtons React component in packages/web/src/components/FeedbackButtons.tsx. Thumbs up/down icons, appear on hover over assistant messages. Thumbs-down click expands a category picker (Inaccurate, Not relevant, Incomplete, Harmful). Selected state shows which button was clicked. Disable after submission (one rating per message). Use Tailwind, match existing dark theme.","depends_on":["eval-01"],"requires":[],"status":"pending"}
{"id":"eval-03","story":"user-feedback","description":"Add POST /api/feedback endpoint in packages/web/src/app/api/feedback/route.ts. Accepts { messageId, sessionId, rating, category? }. Validates with Zod schema from eval-01. Writes eval:feedback event to session JSONL via FileSessionWriter. Returns 200 on success, 400 on validation error, 429 if rate-limited.","depends_on":["eval-01"],"requires":[],"status":"pending"}
{"id":"eval-04","story":"user-feedback","description":"Integrate FeedbackButtons into chat message rendering in packages/web/src/app/page.tsx (or message component). Wire up POST call to /api/feedback. Show optimistic UI (selected state immediately), revert on error. Pass messageId and sessionId as props.","depends_on":["eval-02","eval-03"],"requires":[],"status":"pending"}
{"id":"eval-05","story":"user-feedback","description":"Display feedback events in trace inspector. Add a FeedbackBadge to TraceInspector that shows thumbs icon + category (if negative) inline with the rated message's trace events. Filter/highlight: green for positive, red with category label for negative.","depends_on":["eval-04"],"requires":[],"status":"pending"}
{"id":"eval-06","story":"user-feedback","description":"Add dbt staging model stg_feedback_events in packages/pipeline. Source from eval:feedback events in raw JSONL. Columns: session_id, message_id, rating, category, timestamp. Add schema tests: not_null on session_id/message_id/rating, accepted_values for rating and category. Join-ready with existing int_amygdala_passes on session_id + message sequencing.","depends_on":["eval-01"],"requires":[],"status":"pending"}
{"id":"eval-07","story":"user-feedback","description":"Write component tests for FeedbackButtons (packages/web/test/feedback-buttons.test.ts). Cover: renders thumbs up/down, click fires callback, thumbs-down expands category picker, category selection fires callback with category, disabled after submission, hover behavior. Write endpoint tests for POST /api/feedback: valid payload persists event, invalid payload returns 400, missing fields rejected.","depends_on":["eval-04"],"requires":[],"status":"pending"}
```
