'use client';

import { formatCost } from '@/lib/format';

type SpendGaugeProps = {
  spendStatus: {
    currentSpendUsd: number;
    dailyCapUsd: number;
    remainingUsd: number;
    percentUsed: number;
    resetAtUtc: string;
  } | null;
};

function hoursUntilReset(resetAtUtc: string): string {
  const ms = new Date(resetAtUtc).getTime() - Date.now();
  if (ms <= 0) return 'resetting...';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return h > 0 ? `resets in ${h}h` : `resets in ${m}m`;
}

function barColor(percent: number): string {
  if (percent >= 90) return 'bg-error';
  if (percent >= 60) return 'bg-warning';
  return 'bg-success';
}

export function SpendGauge({ spendStatus }: SpendGaugeProps) {
  if (!spendStatus) return null;

  const { currentSpendUsd, dailyCapUsd, percentUsed, resetAtUtc } = spendStatus;
  const clamped = Math.min(percentUsed, 100);
  const budgetReached = percentUsed >= 100;

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Bar */}
      <div className="h-1.5 w-16 rounded-full bg-bg-hover">
        <div
          className={`h-full rounded-full transition-all ${barColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>

      {/* Amount */}
      {budgetReached ? (
        <span className="text-error">Budget reached</span>
      ) : (
        <span className="text-text-secondary">
          {formatCost(currentSpendUsd)} / {formatCost(dailyCapUsd)}
        </span>
      )}

      {/* Reset countdown */}
      <span className="text-text-muted">{hoursUntilReset(resetAtUtc)}</span>
    </div>
  );
}
