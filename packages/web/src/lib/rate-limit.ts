/**
 * In-memory rate limiting and concurrent connection guard.
 *
 * Two layers:
 * 1. Sliding window rate limiter — limits request frequency per IP
 * 2. Connection guard — limits concurrent SSE streams per IP
 *
 * Both use module-level Maps that persist across requests in the Node.js process.
 * For multi-instance deploys, swap to Redis-backed stores (e.g. @upstash/ratelimit).
 */

// ---------------------------------------------------------------------------
// Config (env-driven with defaults)
// ---------------------------------------------------------------------------

export const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM ?? '5', 10);
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute sliding window
export const RATE_LIMIT_CONCURRENT = parseInt(process.env.RATE_LIMIT_CONCURRENT ?? '2', 10);
const MAX_TRACKED_IPS = 10_000;
const CLEANUP_INTERVAL_MS = 60_000;

// ---------------------------------------------------------------------------
// Sliding window rate limiter
// ---------------------------------------------------------------------------

/** Timestamps of recent requests per IP. */
const requestLog = new Map<string, number[]>();

/** Prune timestamps older than the window and drop stale IPs. */
function pruneRequestLog(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS;
  for (const [ip, timestamps] of requestLog) {
    const filtered = timestamps.filter((t) => t > cutoff);
    if (filtered.length === 0) {
      requestLog.delete(ip);
    } else {
      requestLog.set(ip, filtered);
    }
  }
}

// Safety-valve cleanup to prevent memory leaks.
const _cleanupTimer = setInterval(pruneRequestLog, CLEANUP_INTERVAL_MS);
// Allow the Node.js process to exit even if the timer is still active.
if (_cleanupTimer.unref) _cleanupTimer.unref();

export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the client should retry (only set when blocked). */
  retryAfter?: number;
  /** Remaining requests in the current window. */
  remaining: number;
}

export function checkRateLimit(ip: string): RateLimitResult {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  let timestamps = requestLog.get(ip);
  if (timestamps) {
    timestamps = timestamps.filter((t) => t > cutoff);
  } else {
    timestamps = [];
  }

  if (timestamps.length >= RATE_LIMIT_RPM) {
    const oldestInWindow = timestamps[0]!;
    const retryAfter = Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000);
    return { allowed: false, retryAfter, remaining: 0 };
  }

  // Safety valve: cap tracked IPs.
  if (!requestLog.has(ip) && requestLog.size >= MAX_TRACKED_IPS) {
    pruneRequestLog();
    // If still at capacity after pruning, allow the request but don't track.
    if (requestLog.size >= MAX_TRACKED_IPS) {
      return { allowed: true, remaining: RATE_LIMIT_RPM - 1 };
    }
  }

  timestamps.push(now);
  requestLog.set(ip, timestamps);
  return { allowed: true, remaining: RATE_LIMIT_RPM - timestamps.length };
}

// ---------------------------------------------------------------------------
// Read-only rate-limit status query
// ---------------------------------------------------------------------------

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  activeConnections: number;
  concurrencyLimit: number;
  /** ms until the oldest request in the window expires (0 if window is empty) */
  resetMs: number;
}

/**
 * Returns the current rate-limit state for an IP. Pure read — no side effects.
 * Used to populate SSE metadata and HTTP headers without recording a new request.
 */
export function getRateLimitStatus(ip: string): RateLimitStatus {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_WINDOW_MS;

  const timestamps = (requestLog.get(ip) ?? []).filter((t) => t > cutoff);
  const remaining = Math.max(0, RATE_LIMIT_RPM - timestamps.length);

  let resetMs = 0;
  if (timestamps.length > 0) {
    const oldest = timestamps[0]!;
    resetMs = Math.max(0, oldest + RATE_LIMIT_WINDOW_MS - now);
  }

  return {
    remaining,
    limit: RATE_LIMIT_RPM,
    activeConnections: activeConnections.get(ip) ?? 0,
    concurrencyLimit: RATE_LIMIT_CONCURRENT,
    resetMs,
  };
}

// ---------------------------------------------------------------------------
// Concurrent connection guard
// ---------------------------------------------------------------------------

/** Number of active SSE streams per IP. */
const activeConnections = new Map<string, number>();

export function acquireConnection(ip: string): boolean {
  const current = activeConnections.get(ip) ?? 0;
  if (current >= RATE_LIMIT_CONCURRENT) {
    return false;
  }
  activeConnections.set(ip, current + 1);
  return true;
}

export function releaseConnection(ip: string): void {
  const current = activeConnections.get(ip) ?? 0;
  if (current <= 1) {
    activeConnections.delete(ip);
  } else {
    activeConnections.set(ip, current - 1);
  }
}

// ---------------------------------------------------------------------------
// IP extraction helper
// ---------------------------------------------------------------------------

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]!.trim();
  }
  // Fallback — in production behind a proxy this header should always exist.
  return request.headers.get('x-real-ip') ?? 'unknown';
}

// ---------------------------------------------------------------------------
// Test helpers (not exported in production builds, but useful for testing)
// ---------------------------------------------------------------------------

export function _resetForTesting(): void {
  requestLog.clear();
  activeConnections.clear();
}
