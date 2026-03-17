/** Format a cost in dollars to a human-readable string */
export function formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return '$0.00';
  if (cost < 0.001) return `$${cost.toFixed(6)}`;
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(3)}`;
}

/** Format a token count with k/M suffixes */
export function formatTokens(count: number): string {
  if (!Number.isFinite(count) || count < 1_000) return String(Math.max(0, count || 0));
  if (count < 1_000_000) return `${(count / 1_000).toFixed(1)}k`;
  return `${(count / 1_000_000).toFixed(2)}M`;
}

/** Format milliseconds to a human-readable duration */
export function formatLatency(ms: number): string {
  if (!Number.isFinite(ms) || ms < 1_000) return `${Math.round(Math.max(0, ms || 0))}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}
