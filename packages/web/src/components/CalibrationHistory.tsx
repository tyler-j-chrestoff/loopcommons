'use client';

import { useEffect, useState } from 'react';
import type { CalibrationIteration } from '@/lib/types';

// ---------------------------------------------------------------------------
// Convergence Chart (cal-12) — SVG line chart of fitness over iterations
// ---------------------------------------------------------------------------

const CHART_W = 560;
const CHART_H = 180;
const PAD = { top: 16, right: 16, bottom: 28, left: 48 };

function ConvergenceChart({ data }: { data: CalibrationIteration[] }) {
  if (data.length < 2) return null;

  const scores = data.map(d => d.fitnessScore);
  const minY = Math.min(...scores) - 0.02;
  const maxY = Math.max(...scores) + 0.02;
  const rangeY = maxY - minY || 0.1;

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (data.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - minY) / rangeY) * innerH;

  // Baseline dashed line
  const baselineY = y(data[0].fitnessScore);

  // Line path through all points
  const linePath = data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.fitnessScore).toFixed(1)}`).join(' ');

  // Y-axis ticks (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => minY + (rangeY * i) / 4);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" aria-label="Convergence chart">
      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line x1={PAD.left} x2={CHART_W - PAD.right} y1={y(tick)} y2={y(tick)} stroke="var(--color-border)" strokeWidth="0.5" />
          <text x={PAD.left - 6} y={y(tick) + 3} textAnchor="end" fill="var(--color-text-secondary)" fontSize="9">
            {tick.toFixed(2)}
          </text>
        </g>
      ))}

      {/* Baseline dashed line */}
      <line
        x1={PAD.left}
        x2={CHART_W - PAD.right}
        y1={baselineY}
        y2={baselineY}
        stroke="var(--color-text-secondary)"
        strokeWidth="1"
        strokeDasharray="4 3"
        opacity="0.6"
      />

      {/* Line path */}
      <path d={linePath} fill="none" stroke="var(--color-accent)" strokeWidth="1.5" />

      {/* Data points */}
      {data.map((d, i) => {
        const isReverted = d.decision === 'reverted';
        return (
          <circle
            key={i}
            data-iteration={d.iteration}
            cx={x(i)}
            cy={y(d.fitnessScore)}
            r={4}
            fill={isReverted ? 'transparent' : 'var(--color-accent)'}
            stroke={isReverted ? '#ef4444' : 'var(--color-accent)'}
            strokeWidth={isReverted ? 1.5 : 0}
          >
            <title>{`#${d.iteration}: ${d.fitnessScore.toFixed(3)} (${d.decision})`}</title>
          </circle>
        );
      })}

      {/* X-axis labels */}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={CHART_H - 4} textAnchor="middle" fill="var(--color-text-secondary)" fontSize="9">
          {d.iteration}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Metric Breakdown (cal-13) — four metric lines over kept iterations
// ---------------------------------------------------------------------------

const METRIC_COLORS: Record<string, string> = {
  detectionRate: '#22c55e',
  fpRate: '#ef4444',
  simplicity: '#3b82f6',
  costEfficiency: '#a855f7',
};

const METRIC_LABELS: Record<string, string> = {
  detectionRate: 'Detection Rate',
  fpRate: 'FP Rate',
  simplicity: 'Simplicity',
  costEfficiency: 'Cost Efficiency',
};

function MetricBreakdown({ data }: { data: CalibrationIteration[] }) {
  // Show trajectory through kept iterations + baseline
  const trajectory = data.filter(d => d.decision !== 'reverted');
  if (trajectory.length < 2) return null;

  const metrics = ['detectionRate', 'fpRate', 'simplicity', 'costEfficiency'] as const;

  // Compute bounds across all metrics
  const allValues = trajectory.flatMap(d => metrics.map(m => d.metricsAfter[m]));
  const minY = Math.min(...allValues) - 0.02;
  const maxY = Math.max(...allValues) + 0.02;
  const rangeY = maxY - minY || 0.1;

  const innerW = CHART_W - PAD.left - PAD.right;
  const innerH = CHART_H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (trajectory.length - 1)) * innerW;
  const y = (v: number) => PAD.top + (1 - (v - minY) / rangeY) * innerH;

  return (
    <div>
      <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full" aria-label="Metric breakdown">
        {metrics.map(metric => {
          const path = trajectory
            .map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.metricsAfter[metric]).toFixed(1)}`)
            .join(' ');
          return <path key={metric} data-metric={metric} d={path} fill="none" stroke={METRIC_COLORS[metric]} strokeWidth="1.5" opacity="0.8" />;
        })}
      </svg>
      <div className="flex flex-wrap gap-3 px-2 text-xs">
        {metrics.map(metric => (
          <span key={metric} className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: METRIC_COLORS[metric] }} />
            {METRIC_LABELS[metric]}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Iteration Row
// ---------------------------------------------------------------------------

function IterationRow({ item }: { item: CalibrationIteration }) {
  const [expanded, setExpanded] = useState(false);

  const editSummary = item.proposedEdit ?? '—';
  const truncated = editSummary.length > 120 ? editSummary.slice(0, 120) + '…' : editSummary;
  const needsTruncation = editSummary.length > 120;

  const badgeColor =
    item.decision === 'baseline'
      ? 'bg-blue-900/40 text-blue-300'
      : item.decision === 'kept'
        ? 'bg-green-900/40 text-green-300'
        : 'bg-red-900/40 text-red-300';

  return (
    <div className="border-b border-border px-3 py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="font-mono text-text-secondary w-6 text-right shrink-0">#{item.iteration}</span>
        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${badgeColor}`}>{item.decision}</span>
        <span className="font-mono text-text">{item.fitnessScore.toFixed(3)}</span>
        <span className="text-text-secondary text-xs truncate flex-1">
          {needsTruncation && !expanded ? truncated : editSummary}
        </span>
        {needsTruncation && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-accent hover:underline shrink-0">
            {expanded ? 'less' : 'more'}
          </button>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CalibrationHistory (cal-11) — main export
// ---------------------------------------------------------------------------

export function CalibrationHistory() {
  const [data, setData] = useState<CalibrationIteration[] | null>(null);
  const [error, setError] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    fetch('/api/metrics/calibration')
      .then(res => {
        if (!res.ok) throw new Error('fetch failed');
        return res.json();
      })
      .then(setData)
      .catch(() => setError(true));
  }, []);

  if (error) {
    return <div className="p-4 text-sm text-red-400">Failed to load calibration data.</div>;
  }

  if (data === null) {
    return <div className="p-4 text-sm text-text-secondary">Loading calibration data…</div>;
  }

  if (data.length === 0) {
    return (
      <div className="p-4 text-sm text-text-secondary">
        No calibration data yet — run <code className="text-xs bg-bg-hover px-1 rounded">npm run calibrate</code> in packages/llm.
      </div>
    );
  }

  const latest = data[data.length - 1];

  return (
    <div className="border-t border-border">
      {/* Collapsible header */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-bg-hover transition-colors"
        aria-expanded={!collapsed}
        aria-label="Toggle calibration history"
      >
        <span className="text-sm font-medium text-text">
          {collapsed ? '▸' : '▾'} Calibration
        </span>
        <span className="text-xs text-text-secondary">
          {data.length} iter · {latest.fitnessScore.toFixed(3)}
        </span>
      </button>

      {/* Expandable content */}
      {!collapsed && (
        <div className="flex flex-col gap-3 px-3 pb-3">
          {/* Convergence Chart */}
          <ConvergenceChart data={data} />

          {/* Metric Breakdown */}
          <MetricBreakdown data={data} />

          {/* Iteration Timeline */}
          <div className="border border-border rounded overflow-hidden max-h-64 overflow-y-auto">
            {data.map(item => (
              <IterationRow key={item.iteration} item={item} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
