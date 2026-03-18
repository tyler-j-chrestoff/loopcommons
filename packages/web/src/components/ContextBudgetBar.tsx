'use client';

import { useState } from 'react';
import { formatCost, formatTokens } from '@/lib/format';
import { TokenBreakdown } from '@/components/TokenBreakdown';
import type { BudgetSnapshot } from '@/lib/token-budget';

type ContextBudgetBarProps = {
  snapshot: BudgetSnapshot | null;
  isStreaming?: boolean;
};

function fillColor(percent: number): string {
  if (percent >= 100) return 'bg-error';
  if (percent >= 90) return 'bg-orange-500';
  if (percent >= 75) return 'bg-warning';
  return 'bg-success';
}

export function ContextBudgetBar({ snapshot, isStreaming = false }: ContextBudgetBarProps) {
  const [expanded, setExpanded] = useState(false);

  if (!snapshot) return null;

  const { cumulative, budgetPercent, costEstimate, modelContextLimit, turns } = snapshot;
  const clampedPercent = Math.min(budgetPercent, 100);
  const shouldPulse = budgetPercent >= 90;

  return (
    <div className="border-b border-border bg-bg-surface">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-1.5 text-xs hover:bg-bg-hover transition-colors"
        aria-label={expanded ? 'Collapse token breakdown' : 'Expand token breakdown'}
      >
        {/* Bar */}
        <div className="relative h-2 w-32 rounded-full bg-bg-hover">
          <div
            data-testid="budget-fill"
            className={`h-full rounded-full transition-all duration-500 ${fillColor(clampedPercent)}${shouldPulse ? ' animate-pulse' : ''}`}
            style={{ width: `${clampedPercent}%` }}
          />
          {isStreaming && (
            <div
              data-testid="budget-shimmer"
              className="absolute inset-0 overflow-hidden rounded-full"
            >
              <div className="h-full w-1/3 animate-[shimmer_1.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            </div>
          )}
        </div>

        {/* Percentage */}
        <span className="font-mono text-text-secondary">{budgetPercent}%</span>

        {/* Token count */}
        <span className="text-text-muted">
          {formatTokens(cumulative.inputTokens)} / {formatTokens(modelContextLimit)}
        </span>

        {/* Cost */}
        <span
          data-testid="budget-cost"
          className="text-text-muted cursor-help"
          title={`Haiku 4.5: $1.00/MTok input, $5.00/MTok output, $0.10/MTok cache read, $1.25/MTok cache creation`}
        >
          {formatCost(costEstimate)}
        </span>

        {/* Expand indicator */}
        <span className="ml-auto text-text-muted">
          {expanded ? '▾' : '▸'}
        </span>
      </button>

      {/* Per-turn breakdown */}
      {expanded && turns.length > 0 && (
        <div className="border-t border-border-subtle px-4 py-2">
          <TokenBreakdown turns={turns} />
        </div>
      )}
    </div>
  );
}
