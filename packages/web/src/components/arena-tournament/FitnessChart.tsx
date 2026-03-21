'use client';

/**
 * FitnessChart — SVG line chart showing fitness evolution across generations.
 *
 * Shows best/average/worst fitness per generation. Highlights the winning
 * agent's trajectory. Follows CalibrationHistory SVG pattern.
 */

import type { TournamentGenerationSummary } from '@/lib/arena-types';

type FitnessChartProps = {
  generations: TournamentGenerationSummary[];
};

const CHART_W = 560;
const CHART_H = 200;
const PAD = { top: 20, right: 20, bottom: 30, left: 50 };

const INNER_W = CHART_W - PAD.left - PAD.right;
const INNER_H = CHART_H - PAD.top - PAD.bottom;

export function FitnessChart({ generations }: FitnessChartProps) {
  if (generations.length === 0) {
    return <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>No tournament data yet.</p>;
  }

  // Extract fitness series
  const series = generations.map(g => {
    const scores = g.fitness.map(f => f.fitnessScore);
    return {
      generation: g.generation,
      best: Math.max(...scores),
      avg: scores.reduce((a, b) => a + b, 0) / scores.length,
      worst: Math.min(...scores),
    };
  });

  const allValues = series.flatMap(s => [s.best, s.worst]);
  const yMin = Math.max(0, Math.min(...allValues) - 0.05);
  const yMax = Math.min(1, Math.max(...allValues) + 0.05);
  const xMax = Math.max(1, series.length - 1);

  const x = (gen: number) => PAD.left + (gen / xMax) * INNER_W;
  const y = (val: number) => PAD.top + INNER_H - ((val - yMin) / (yMax - yMin)) * INNER_H;

  const toPath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');

  // Y-axis ticks
  const yTicks = Array.from({ length: 5 }, (_, i) => yMin + (i / 4) * (yMax - yMin));

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full max-w-[560px]" role="img" aria-label="Fitness over generations">
      {/* Grid lines */}
      {yTicks.map((tick, i) => (
        <g key={i}>
          <line
            x1={PAD.left} y1={y(tick)} x2={CHART_W - PAD.right} y2={y(tick)}
            stroke="var(--color-border)" strokeDasharray="4 4" strokeWidth={0.5}
          />
          <text x={PAD.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={10} fill="var(--color-text-secondary)">
            {tick.toFixed(2)}
          </text>
        </g>
      ))}

      {/* Worst band (light fill) */}
      <path
        d={`${toPath(series.map(s => s.best))} ${series.map((s, i) => `L${x(series.length - 1 - i).toFixed(1)},${y(series[series.length - 1 - i].worst).toFixed(1)}`).join(' ')} Z`}
        fill="var(--color-accent)" fillOpacity={0.1}
      />

      {/* Lines */}
      <path d={toPath(series.map(s => s.worst))} fill="none" stroke="var(--color-error)" strokeWidth={1} strokeDasharray="4 2" />
      <path d={toPath(series.map(s => s.avg))} fill="none" stroke="var(--color-text-secondary)" strokeWidth={1.5} />
      <path d={toPath(series.map(s => s.best))} fill="none" stroke="var(--color-success)" strokeWidth={2} />

      {/* Data points for best */}
      {series.map((s, i) => (
        <circle key={i} cx={x(i)} cy={y(s.best)} r={3} fill="var(--color-success)" />
      ))}

      {/* X-axis labels */}
      {series.map((s, i) => (
        <text key={i} x={x(i)} y={CHART_H - 5} textAnchor="middle" fontSize={10} fill="var(--color-text-secondary)">
          {s.generation}
        </text>
      ))}

      {/* Axis labels */}
      <text x={CHART_W / 2} y={CHART_H} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)">
        Generation
      </text>
      <text x={12} y={CHART_H / 2} textAnchor="middle" fontSize={11} fill="var(--color-text-secondary)" transform={`rotate(-90, 12, ${CHART_H / 2})`}>
        Fitness
      </text>

      {/* Legend */}
      <g transform={`translate(${PAD.left + 8}, ${PAD.top + 5})`}>
        <line x1={0} y1={0} x2={16} y2={0} stroke="var(--color-success)" strokeWidth={2} />
        <text x={20} y={4} fontSize={9} fill="var(--color-text-secondary)">best</text>
        <line x1={50} y1={0} x2={66} y2={0} stroke="var(--color-text-secondary)" strokeWidth={1.5} />
        <text x={70} y={4} fontSize={9} fill="var(--color-text-secondary)">avg</text>
        <line x1={94} y1={0} x2={110} y2={0} stroke="var(--color-error)" strokeWidth={1} strokeDasharray="4 2" />
        <text x={114} y={4} fontSize={9} fill="var(--color-text-secondary)">worst</text>
      </g>
    </svg>
  );
}
