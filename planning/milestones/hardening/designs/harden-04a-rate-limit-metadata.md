# Design: Rate-Limit Metadata Exposure for SSE Streams (harden-04a)

## Summary

Expose rate-limit state to the frontend via two channels:
1. Standard HTTP headers on the SSE response
2. A web-layer SSE event emitted at stream start

This gives the planned `RateLimitIndicator` (harden-04b) everything it needs without polling.

---

## Decision 1: Where to define the event type

**Recommendation: Define `rate-limit:status` in `packages/web` only.**

Rate limiting is a web-layer concern. The `packages/llm` agent engine has no concept of HTTP, IPs, or request budgets. Adding it to the `TraceEvent` union in `packages/llm/src/trace/events.ts` would leak a web concern into the LLM package and force every consumer of that type to handle an event they'll never produce.

Instead:
- The existing `ChatSSEEvent` type in `packages/web/src/lib/types.ts` already extends `TraceEvent` with the web-only `{ type: 'done' }` variant. Add `rate-limit:status` there as another web-only variant.
- The event is injected in `route.ts` via `sendEvent()` directly, outside the `TraceCollector` callback. This is the same pattern used for the `done` event.

## Decision 2: When to emit the event

**Recommendation: Once at stream start only.**

Rationale:
- The rate-limit state is most useful at the moment the user initiates a request. It tells them "you have N requests left in this window."
- Emitting after each round adds complexity for no real gain: the values don't change mid-stream (the request was already counted once at admission, and the connection count stays at 1 for this stream).
- If we later need mid-stream updates (e.g., another tab's request changes the count), we can add a `rate-limit:update` event. YAGNI for now.

Emit the event immediately after the SSE response begins, before the agent loop starts.

## Decision 3: Event payload shape

```typescript
// In packages/web/src/lib/types.ts, add to ChatSSEEvent union:
| {
    type: 'rate-limit:status';
    remaining: number;       // requests left in current window
    limit: number;           // max requests per window (RATE_LIMIT_RPM)
    activeConnections: number; // concurrent streams for this IP (including current)
    concurrencyLimit: number;  // max concurrent streams (RATE_LIMIT_CONCURRENT)
    resetMs: number;         // ms until the oldest request in the window expires
    timestamp: number;
  }
```

Design notes:
- `remaining` and `limit` are the standard rate-limit pair. Sending `limit` lets the frontend compute a percentage without hardcoding the server config.
- `activeConnections` and `concurrencyLimit` give the frontend both current value and max, enabling the harden-04b indicator to show "1/2 connections".
- `resetMs` is milliseconds (not a wall-clock time) until the sliding window's oldest entry expires. The frontend can start a countdown from this. Using a relative duration avoids clock-skew issues between server and client.
- `timestamp` is included for consistency with all other SSE events.

## Decision 4: HTTP headers

**Recommendation: Add three standard headers to the SSE response.**

```
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 17
X-RateLimit-Reset: 1710600000    (Unix epoch seconds when window resets)
```

These follow the [IETF draft-ietf-httpapi-ratelimit-headers](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) convention. Adding `Limit` and `Reset` alongside `Remaining` is essentially free (we already compute `remaining` from `checkRateLimit()`) and gives any HTTP client (not just our frontend) useful information.

The 429 response already includes `X-RateLimit-Remaining: 0` and `Retry-After`. No changes needed there.

## Decision 5: New `getRateLimitStatus(ip)` function

**Recommendation: Yes, add it to `rate-limit.ts`.**

The current `checkRateLimit()` has a side effect: it records a new request timestamp. We need a read-only query for emitting the SSE event (the request was already counted during admission). We also need `activeConnections` count and the window reset time, which `checkRateLimit()` doesn't return.

```typescript
export interface RateLimitStatus {
  remaining: number;
  limit: number;
  activeConnections: number;
  concurrencyLimit: number;
  /** ms until the oldest request in the window expires (0 if window is empty) */
  resetMs: number;
}

export function getRateLimitStatus(ip: string): RateLimitStatus;
```

This is a pure read with no side effects. It filters stale timestamps, computes remaining, peeks at active connections, and calculates the reset delta. It reuses the existing module-level Maps and config constants.

---

## Integration Points

### `packages/web/src/lib/rate-limit.ts`
- Add `RateLimitStatus` interface and `getRateLimitStatus(ip)` function.
- Export `RATE_LIMIT_RPM` and `RATE_LIMIT_CONCURRENT` as named constants (currently `const` but not exported). Needed for the status function and headers.

### `packages/web/src/lib/types.ts`
- Add `rate-limit:status` variant to `ChatSSEEvent` union.

### `packages/web/src/app/api/chat/route.ts`
- Import `getRateLimitStatus` from rate-limit.ts.
- After acquiring the connection, call `getRateLimitStatus(ip)` and:
  1. Set `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` headers on the SSE `Response`.
  2. Emit the `rate-limit:status` event via `sendEvent()` as the first event before starting the agent loop.

### `packages/web/src/lib/use-chat.ts`
- Add a handler for `rate-limit:status` events. Store the payload in a new `rateLimitStatus` state field exposed from the hook. This gives harden-04b's `RateLimitIndicator` component everything it needs.
- Also read `X-RateLimit-Remaining` from the response headers as a fallback / immediate signal (available before SSE parsing starts).

---

## What this does NOT cover

- **Frontend visualization** -- that's harden-04b.
- **429 UI treatment** -- also harden-04b (it already has `Retry-After` in the 429 JSON response).
- **Multi-instance rate limiting** -- out of scope; the upgrade path to Redis is documented in rate-limit.ts.
- **Per-round updates** -- YAGNI. Can be added later by emitting additional events if needed.
