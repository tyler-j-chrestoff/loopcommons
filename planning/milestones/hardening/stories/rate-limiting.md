# Story: Rate Limiting & Concurrency Control

> As an **attacker**, I try to spam the chat endpoint to burn Tyler's API budget. The server rejects my requests after a reasonable threshold. As a **normal user**, I never notice the rate limiter during regular conversation.

## Acceptance Criteria

- Per-IP sliding window rate limiter (e.g., 20 requests/minute)
- Per-IP concurrent request limit (e.g., 2 simultaneous SSE streams)
- Rate limit returns 429 with `Retry-After` header and a friendly JSON error
- Limits are configurable via environment variables
- In-memory store is fine for single-instance deploy; document the upgrade path to Redis if needed later

## Tasks

```jsonl
{"id":"harden-01","story":"rate-limiting","description":"Research: current best practices for rate limiting Next.js App Router API routes. Evaluate existing libraries (e.g., next-rate-limit, upstash/ratelimit, custom middleware). Determine best approach for SSE endpoints specifically (connection-aware limiting). Document findings and recommended approach in this story's acceptance criteria.","depends_on":[],"status":"pending"}
{"id":"harden-02","story":"rate-limiting","description":"Implement in-memory sliding window rate limiter middleware for /api/chat. Configurable via RATE_LIMIT_RPM env var (default 20). Returns 429 with Retry-After header. Approach informed by harden-01 research.","depends_on":["harden-01"],"status":"pending"}
{"id":"harden-03","story":"rate-limiting","description":"Add per-IP concurrent request counter. Reject with 429 if more than RATE_LIMIT_CONCURRENT (default 2) SSE streams are open from same IP. Decrement on stream close.","depends_on":["harden-02"],"status":"pending"}
{"id":"harden-04","story":"rate-limiting","description":"Red-team: rapid curl loop (50 requests in 5 seconds) from same IP. Verify early requests succeed, later ones get 429. Verify normal pacing (1 req/3s) is never limited.","depends_on":["harden-03"],"requires":["ANTHROPIC_API_KEY"],"status":"pending"}
```
