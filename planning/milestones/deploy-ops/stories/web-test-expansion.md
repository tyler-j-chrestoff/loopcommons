# Story: Web Test Expansion

> As **Tyler (maintainer)**, I want comprehensive web test coverage so that changes don't break production, and I can refactor with confidence.

## Acceptance Criteria

- Test coverage for all route handlers: `/api/chat`, `/api/sessions`, `/api/sessions/[id]`, `/api/metrics`, `/api/health`
- Test coverage for key lib modules not yet tested: `format.ts`, `use-chat.ts`, `session-writer.ts`
- Smoke render tests for all React components (at minimum: renders without crashing)
- Coverage target: >=80% of routes and lib modules
- All new tests pass in CI (`test-web` job)

## Current State

**Tested** (6 test files, 64 tests):
- `sanitize-event.test.ts` — SSE and session event sanitization
- `rate-limit.test.ts` — rate limiter and concurrency guard
- `spend-tracker.test.ts` — daily spend cap tracking
- `sanitize.test.ts` — input sanitization (Unicode, role-spoofing)
- `file-session-writer.test.ts` — JSONL file writing
- `red-team-sessions.test.ts` — session API security

**Untested routes** (4):
- `POST /api/chat` — the main chat endpoint (amygdala pipeline, SSE streaming)
- `GET /api/sessions` — session list
- `GET /api/sessions/[id]` — session detail
- `GET /api/metrics` — pipeline metrics

**Untested lib modules** (3 with testable logic):
- `format.ts` — formatting utilities
- `use-chat.ts` — chat hook (SSE parsing, state management)
- `session-writer.ts` — SessionWriter interface/types

**Untested components** (16):
- Layout, ChatInput, ChatThread, MessageBubble, ToolCallInline
- TraceTimeline, TraceInspector, CostDashboard, SpendGauge
- AmygdalaInspector, AmygdalaPassCard, PipelineTimeline, RoutingCard
- SecurityEventLog, RateLimitIndicator, ComparisonMode

## Tasks

```jsonl
{"id":"ops-20","story":"web-test-expansion","description":"Set up React component testing infrastructure: add @testing-library/react and @testing-library/jest-dom to packages/web devDependencies. Configure vitest for JSX/TSX (ensure vitest.config.ts has the right environment: 'jsdom' or 'happy-dom'). Write one smoke test to confirm the setup works (e.g., Layout renders without crashing).","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-21","story":"web-test-expansion","description":"Write route handler tests for GET /api/sessions and GET /api/sessions/[id]. Mock FileSessionWriter to return known session data. Test: (1) sessions list returns paginated results, (2) session detail returns events array, (3) session detail returns 404 for unknown ID, (4) sanitization is applied (no rawResponse in output). Place in packages/web/test/api-sessions.test.ts.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-22","story":"web-test-expansion","description":"Write route handler tests for GET /api/metrics. Mock the metrics.json file read. Test: (1) returns metrics JSON when file exists, (2) returns appropriate error/empty response when file is missing. Place in packages/web/test/api-metrics.test.ts.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-23","story":"web-test-expansion","description":"Write route handler tests for POST /api/chat. This is the most complex route — mock the amygdala, orchestrator, and agent to avoid real LLM calls. Test: (1) returns SSE stream with correct content-type, (2) rate limiting rejects when over limit, (3) spend cap rejects when exceeded, (4) session ID is returned in headers and SSE stream, (5) input sanitization rejects role-spoofing attempts. Place in packages/web/test/api-chat.test.ts.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-24","story":"web-test-expansion","description":"Write tests for format.ts: test all exported formatting functions with representative inputs and edge cases. Place in packages/web/test/format.test.ts.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-25","story":"web-test-expansion","description":"Write tests for use-chat.ts: test the SSE event parsing logic and state transitions. Mock fetch/EventSource to simulate SSE streams. Test: (1) parses text-delta events into message content, (2) handles trace events, (3) handles error events, (4) handles session:start event. Place in packages/web/test/use-chat.test.ts.","depends_on":["ops-20"],"requires":[],"status":"pending"}
{"id":"ops-26","story":"web-test-expansion","description":"Write component smoke tests for core chat components: Layout, ChatInput, ChatThread, MessageBubble, ToolCallInline. Each test renders the component with minimal required props and asserts it doesn't throw. Test ChatInput has an input field and submit mechanism. Place in packages/web/test/components-chat.test.tsx.","depends_on":["ops-20"],"requires":[],"status":"pending"}
{"id":"ops-27","story":"web-test-expansion","description":"Write component smoke tests for observability components: TraceTimeline, TraceInspector, CostDashboard, SpendGauge, SecurityEventLog, RateLimitIndicator. Each test renders with minimal mock data and asserts it doesn't throw. Place in packages/web/test/components-observability.test.tsx.","depends_on":["ops-20"],"requires":[],"status":"pending"}
{"id":"ops-28","story":"web-test-expansion","description":"Write component smoke tests for amygdala viz components: AmygdalaInspector, AmygdalaPassCard, PipelineTimeline, RoutingCard, ComparisonMode. Each test renders with minimal mock data and asserts it doesn't throw. Place in packages/web/test/components-amygdala.test.tsx.","depends_on":["ops-20"],"requires":[],"status":"pending"}
{"id":"ops-29","story":"web-test-expansion","description":"Verify coverage target: run vitest with coverage reporting. Confirm >=80% coverage of route handlers and lib modules. If any gaps remain, add targeted tests. Update CI workflow if coverage reporting isn't already configured.","depends_on":["ops-21","ops-22","ops-23","ops-24","ops-25","ops-26","ops-27","ops-28"],"requires":[],"status":"pending"}
```
