/**
 * In-memory daily spend tracker.
 *
 * Accumulates LLM cost per UTC day and enforces a configurable daily cap.
 * Pre-check with `canSpend()` before calling the agent; post-increment with
 * `recordSpend()` after the agent returns. Can overshoot by one request
 * (~$0.25 for Haiku) — acceptable since the Anthropic Console monthly limit
 * is the backstop.
 *
 * Counter resets on server restart or when the UTC date rolls over.
 * For multi-instance deploys, swap to a shared store (e.g. Redis).
 */

// ---------------------------------------------------------------------------
// Config (env-driven with defaults)
// ---------------------------------------------------------------------------

const DAILY_SPEND_CAP_USD = parseFloat(
  process.env.DAILY_SPEND_CAP_USD ?? '5.00',
);

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** Single-entry store: spend accumulated for a given UTC date string. */
const spendStore: { dateKey: string; totalUsd: number } = {
  dateKey: '',
  totalUsd: 0,
};

/** Returns the current UTC date as "YYYY-MM-DD". */
function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Ensure the store is aligned to today's UTC date.
 * If the date has rolled over, reset the counter.
 */
function ensureCurrentDay(): void {
  const today = utcDateKey();
  if (spendStore.dateKey !== today) {
    spendStore.dateKey = today;
    spendStore.totalUsd = 0;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Status snapshot returned by `getSpendStatus()`. */
export interface SpendStatus {
  /** Cost accumulated so far today (USD). */
  currentSpendUsd: number;
  /** Configured daily cap (USD). */
  dailyCapUsd: number;
  /** How much headroom remains before the cap (USD, floored at 0). */
  remainingUsd: number;
  /** Percentage of the daily cap used (0–100+). */
  percentUsed: number;
  /** ISO-8601 timestamp when the counter resets (start of next UTC day). */
  resetAtUtc: string;
}

/**
 * Check whether the daily spend cap still has headroom.
 * Call this **before** invoking the agent.
 */
export function canSpend(): boolean {
  ensureCurrentDay();
  return spendStore.totalUsd < DAILY_SPEND_CAP_USD;
}

/**
 * Record the cost of a completed request.
 * Call this **after** the agent returns with a cost figure.
 */
export function recordSpend(cost: number): void {
  ensureCurrentDay();
  spendStore.totalUsd += cost;
}

/**
 * Return a snapshot of current spend status for UI display and trace events.
 */
export function getSpendStatus(): SpendStatus {
  ensureCurrentDay();

  const currentSpendUsd = spendStore.totalUsd;
  const remainingUsd = Math.max(0, DAILY_SPEND_CAP_USD - currentSpendUsd);
  const percentUsed =
    DAILY_SPEND_CAP_USD > 0
      ? (currentSpendUsd / DAILY_SPEND_CAP_USD) * 100
      : 100;

  // Next UTC midnight
  const tomorrow = new Date(spendStore.dateKey + 'T00:00:00Z');
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const resetAtUtc = tomorrow.toISOString();

  return {
    currentSpendUsd,
    dailyCapUsd: DAILY_SPEND_CAP_USD,
    remainingUsd,
    percentUsed,
    resetAtUtc,
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

export function _resetForTesting(): void {
  spendStore.dateKey = '';
  spendStore.totalUsd = 0;
}
