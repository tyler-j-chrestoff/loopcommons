# Story: Rate Limiting & Concurrency Control

> As an **attacker**, I try to spam the chat endpoint to burn Tyler's API budget. The server rejects my requests after a reasonable threshold. As a **normal user**, I never notice the rate limiter during regular conversation.

## Acceptance Criteria

- Per-IP sliding window rate limiter (e.g., 20 requests/minute)
- Per-IP concurrent request limit (e.g., 2 simultaneous SSE streams)
- Rate limit returns 429 with `Retry-After` header and a friendly JSON error
- Limits are configurable via environment variables
- In-memory store is fine for single-instance deploy; document the upgrade path to Redis if needed later
- Rate limit state is observable in the UI: remaining requests, active connections, and 429 events are visualized in real-time

## Tasks

```jsonl
{"id":"harden-01","story":"rate-limiting","description":"Research: current best practices for rate limiting Next.js App Router API routes. Evaluate existing libraries (e.g., next-rate-limit, upstash/ratelimit, custom middleware). Determine best approach for SSE endpoints specifically (connection-aware limiting). Document findings and recommended approach in this story's acceptance criteria.","depends_on":[],"status":"done","notes":"Custom in-memory approach chosen. No library needed for single-instance. Sliding window + connection guard pattern. Upgrade path: swap Map for @upstash/ratelimit if going multi-instance."}
{"id":"harden-02","story":"rate-limiting","description":"Implement in-memory sliding window rate limiter middleware for /api/chat. Configurable via RATE_LIMIT_RPM env var (default 20). Returns 429 with Retry-After header. Approach informed by harden-01 research.","depends_on":["harden-01"],"status":"done","notes":"Implemented in packages/web/src/lib/rate-limit.ts, integrated in route.ts"}
{"id":"harden-03","story":"rate-limiting","description":"Add per-IP concurrent request counter. Reject with 429 if more than RATE_LIMIT_CONCURRENT (default 2) SSE streams are open from same IP. Decrement on stream close.","depends_on":["harden-02"],"status":"done","notes":"Connection guard with acquire/release in rate-limit.ts. Safe double-release guard in route.ts. Abort signal handled."}
{"id":"harden-04","story":"rate-limiting","description":"Red-team: rapid curl loop (50 requests in 5 seconds) from same IP. Verify early requests succeed, later ones get 429. Verify normal pacing (1 req/3s) is never limited.","depends_on":["harden-03"],"requires":["ANTHROPIC_API_KEY"],"status":"done","notes":"17/50 succeeded (rate+concurrency guards interacting), 33 got 429. Retry-After present. Concurrency: 2/5 admitted. Normal pacing: 5/5. Bug found+fixed: concurrency 429 was missing Retry-After header."}
{"id":"harden-04a","story":"rate-limiting","description":"Expose rate-limit metadata in SSE stream: add X-RateLimit-Remaining header to the SSE response, and emit a 'rate-limit:status' trace event (remaining requests, active connections, window reset time) so the frontend can observe it.","depends_on":["harden-03"],"status":"done","notes":"getRateLimitStatus() in rate-limit.ts, rate-limit:status SSE event + X-RateLimit-Limit/Remaining/Reset headers on SSE response. Design doc in designs/harden-04a-rate-limit-metadata.md"}
{"id":"harden-04b","story":"rate-limiting","description":"Build RateLimitIndicator component: subtle inline display showing remaining requests in current window (e.g., '18/20 remaining') and active connection count. Renders in the chat header area. On 429, show a friendly countdown using Retry-After. Visualize the sliding window as a mini spark-line or progress arc.","depends_on":["harden-04a"],"status":"done","notes":"RateLimitIndicator.tsx with progress bar, color shifts (muted→warning→error), connection count. Not yet wired into page.tsx."}
```
