'use client';

import { formatCost, formatTokens } from '@/lib/format';
import type { Turn } from '@/lib/token-budget';

type TokenBreakdownProps = {
  turns: Turn[];
};

// Haiku 4.5 pricing per million tokens (matches token-budget.ts)
const PRICING = {
  input: 1.0,
  cacheRead: 0.1,
  cacheCreation: 1.25,
  output: 5.0,
};

function turnCost(turn: Turn): number {
  const a = turn.actual;
  return (
    (a.inputTokens * PRICING.input +
      a.cacheReadTokens * PRICING.cacheRead +
      a.cacheCreationTokens * PRICING.cacheCreation +
      a.outputTokens * PRICING.output) /
    1_000_000
  );
}

export function TokenBreakdown({ turns }: TokenBreakdownProps) {
  if (turns.length === 0) return null;

  return (
    <div className="space-y-1.5 text-xs">
      {turns.map((turn) => {
        const hasCached = turn.actual.cacheReadTokens > 0;
        return (
          <div
            key={`${turn.turnIndex}-${turn.source}`}
            className="flex items-center gap-2 rounded bg-bg-hover px-2 py-1"
          >
            <span className="w-16 shrink-0 font-mono text-text-secondary">
              {turn.source}
            </span>
            <span className="text-text-muted">
              {formatTokens(turn.actual.inputTokens)}
            </span>
            <span className="text-text-muted">/</span>
            <span className="text-text-muted">
              {formatTokens(turn.actual.outputTokens)}
            </span>
            {hasCached && (
              <span className="text-success">
                {formatTokens(turn.actual.cacheReadTokens)} cached
              </span>
            )}
            <span className="ml-auto text-text-muted">
              {formatCost(turnCost(turn))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
