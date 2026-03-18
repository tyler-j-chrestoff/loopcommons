'use client';

import { useEffect, useState } from 'react';

type RateLimitIndicatorProps = {
  rateLimitStatus: {
    remaining: number;
    limit: number;
    activeConnections: number;
    concurrencyLimit: number;
    resetMs: number;
  } | null;
};

export function RateLimitIndicator({ rateLimitStatus }: RateLimitIndicatorProps) {
  const [stale, setStale] = useState(false);

  // After the rate limit window resets, mark the display as stale
  // so it shows full capacity instead of a stale count.
  useEffect(() => {
    if (!rateLimitStatus || rateLimitStatus.resetMs <= 0) return;
    setStale(false);
    const timer = setTimeout(() => setStale(true), rateLimitStatus.resetMs);
    return () => clearTimeout(timer);
  }, [rateLimitStatus]);

  if (!rateLimitStatus) return null;

  const { limit, concurrencyLimit } = rateLimitStatus;
  // After window resets, show full capacity
  const remaining = stale ? limit : rateLimitStatus.remaining;
  const activeConnections = stale ? 0 : rateLimitStatus.activeConnections;

  const ratio = limit > 0 ? remaining / limit : 1;

  const color =
    ratio <= 0.1 ? 'text-error' : ratio <= 0.25 ? 'text-warning' : 'text-text-muted';
  const barColor =
    ratio <= 0.1 ? 'bg-error' : ratio <= 0.25 ? 'bg-warning' : 'bg-accent';

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Request counter */}
      <div className="flex items-center gap-1.5">
        <div className="relative h-1.5 w-10 overflow-hidden rounded-full bg-bg-hover">
          <div
            className={`absolute left-0 top-0 h-full rounded-full ${barColor} transition-all duration-300`}
            style={{ width: `${ratio * 100}%` }}
          />
        </div>
        <span className={color}>
          {remaining}/{limit}
        </span>
      </div>

      {/* Connection indicator */}
      {activeConnections > 0 && (
        <span className="text-text-muted">
          {activeConnections}/{concurrencyLimit} conn
        </span>
      )}
    </div>
  );
}
