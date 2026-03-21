/**
 * Terminal visualization for arena experiment results.
 *
 * Pure formatting functions — no I/O, no side effects.
 */

import type { RunTrace, E4ApproachCategory } from './types';
import { chiSquarePathDependence } from './analysis';

// ---------------------------------------------------------------------------
// ANSI helpers (no-op if NO_COLOR set)
// ---------------------------------------------------------------------------

const NO_COLOR = !!process.env.NO_COLOR;
const c = {
  bold: (s: string) => NO_COLOR ? s : `\x1b[1m${s}\x1b[0m`,
  dim: (s: string) => NO_COLOR ? s : `\x1b[2m${s}\x1b[0m`,
  green: (s: string) => NO_COLOR ? s : `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => NO_COLOR ? s : `\x1b[31m${s}\x1b[0m`,
  yellow: (s: string) => NO_COLOR ? s : `\x1b[33m${s}\x1b[0m`,
  cyan: (s: string) => NO_COLOR ? s : `\x1b[36m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// Run summary table
// ---------------------------------------------------------------------------

export function formatRunTable(traces: RunTrace[]): string {
  const header = ['Run ID', 'Path', 'Result', 'Steps', 'Choices', 'Approach', 'Duration'];
  const rows = traces.map(t => {
    const durationMs = new Date(t.completedAt).getTime() - new Date(t.startedAt).getTime();
    const durationS = (durationMs / 1000).toFixed(1) + 's';
    const result = t.death.dead
      ? c.red(`✗ ${t.death.cause}`)
      : c.green('✓ WIN');
    return [
      t.runId.slice(0, 24),
      t.pathId,
      result,
      String(t.steps.length),
      String(t.choicePoints.length),
      t.e4ApproachCategory ?? c.dim('n/a'),
      durationS,
    ];
  });

  return formatTable(header, rows);
}

// ---------------------------------------------------------------------------
// Approach distribution (ASCII bar chart)
// ---------------------------------------------------------------------------

const ALL_CATEGORIES: E4ApproachCategory[] = [
  'observe-first', 'act-first', 'systematic', 'breadth-first', 'targeted',
];

export function formatApproachDistribution(traces: RunTrace[]): string {
  const pathIds = [...new Set(traces.map(t => t.pathId))].sort();
  const lines: string[] = [c.bold('Approach Distribution by Path'), ''];

  for (const pid of pathIds) {
    const pathTraces = traces.filter(t => t.pathId === pid);
    const total = pathTraces.length;
    const nullCount = pathTraces.filter(t => t.e4ApproachCategory === null).length;

    lines.push(c.cyan(`  ${pid}`) + c.dim(` (n=${total}${nullCount > 0 ? `, ${nullCount} unclassified` : ''})`));

    for (const cat of ALL_CATEGORIES) {
      const count = pathTraces.filter(t => t.e4ApproachCategory === cat).length;
      if (count === 0) continue;
      const pct = total > 0 ? count / total : 0;
      const barLen = Math.round(pct * 30);
      const bar = '█'.repeat(barLen) + '░'.repeat(30 - barLen);
      lines.push(`    ${cat.padEnd(14)} ${bar} ${count}/${total} (${(pct * 100).toFixed(0)}%)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Crossroads decision tree (for a single trace)
// ---------------------------------------------------------------------------

export function formatCrossroadsTree(trace: RunTrace): string {
  const lines: string[] = [
    c.bold(`Crossroads: ${trace.runId}`),
    c.dim(`  Path: ${trace.pathId}  |  State: ${trace.stateHashes[0]?.slice(0, 8)}...`),
    '',
  ];

  for (let i = 0; i < trace.choicePoints.length; i++) {
    const cp = trace.choicePoints[i];
    const isLast = i === trace.choicePoints.length - 1;
    const prefix = isLast ? '  └─' : '  ├─';
    const indent = isLast ? '    ' : '  │ ';

    const confColor = cp.decision.confidence >= 0.7 ? c.green : cp.decision.confidence >= 0.4 ? c.yellow : c.red;

    lines.push(`${prefix} ${c.bold(`+${cp.decision.chosenTool}`)} ${confColor(`(${cp.decision.confidence.toFixed(2)})`)} @ ${cp.encounterId}`);

    if (cp.decision.droppedTool) {
      lines.push(`${indent} ${c.red(`−${cp.decision.droppedTool}`)} ${c.dim(truncate(cp.decision.sacrificeReasoning ?? '', 80))}`);
    }

    lines.push(`${indent} ${c.dim(truncate(cp.decision.acquisitionReasoning, 100))}`);
    lines.push(`${indent} → ${cp.stateHash.slice(0, 8)}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Stats summary
// ---------------------------------------------------------------------------

export function formatStatsSummary(traces: RunTrace[]): string {
  const total = traces.length;
  const deaths = traces.filter(t => t.death.dead).length;
  const deathRate = total > 0 ? deaths / total : 0;
  const victories = total - deaths;

  const lines: string[] = [
    c.bold('Experiment Summary'),
    '',
    `  Total runs:   ${total}`,
    `  Victories:    ${c.green(String(victories))}`,
    `  Deaths:       ${deaths > 0 ? c.red(String(deaths)) : '0'}`,
    `  Death rate:   ${(deathRate * 100).toFixed(0)}%`,
    '',
  ];

  // Death breakdown
  if (deaths > 0) {
    const causes: Record<string, number> = {};
    for (const t of traces) {
      if (t.death.dead && t.death.cause) {
        causes[t.death.cause] = (causes[t.death.cause] ?? 0) + 1;
      }
    }
    lines.push('  Death causes:');
    for (const [cause, count] of Object.entries(causes).sort((a, b) => b[1] - a[1])) {
      lines.push(`    ${cause.padEnd(16)} ${count}`);
    }
    lines.push('');
  }

  // Path dependence test
  const nonBaseline = traces.filter(t => t.pathId !== 'baseline');
  const chiSq = chiSquarePathDependence(nonBaseline);

  if (chiSq) {
    lines.push(c.bold('  Path Dependence (χ²)'));
    lines.push(`    χ² = ${chiSq.chi2.toFixed(2)}, df = ${chiSq.degreesOfFreedom}, p = ${chiSq.pValue.toFixed(4)}`);
    lines.push(`    Cramér's V = ${chiSq.cramersV.toFixed(3)} ${effectLabel(chiSq.cramersV)}`);
    lines.push(`    ${chiSq.significant ? c.green('✓ Significant (p < 0.05)') : c.yellow('✗ Not significant')}`);
  } else {
    lines.push(c.dim('  χ² test: insufficient data (need ≥2 paths with ≥2 categories)'));
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Full experiment report (combines all sections)
// ---------------------------------------------------------------------------

export function formatExperimentReport(traces: RunTrace[]): string {
  const sections: string[] = [
    '═'.repeat(60),
    c.bold('  ARENA EXPERIMENT REPORT'),
    '═'.repeat(60),
    '',
    formatStatsSummary(traces),
    '',
    '─'.repeat(60),
    '',
    formatApproachDistribution(traces),
    '─'.repeat(60),
    '',
    formatRunTable(traces),
    '',
  ];

  // Show crossroads for first trace per path (sample)
  const pathIds = [...new Set(traces.map(t => t.pathId))];
  for (const pid of pathIds) {
    const sample = traces.find(t => t.pathId === pid && t.choicePoints.length > 0);
    if (sample) {
      sections.push('─'.repeat(60), '', formatCrossroadsTree(sample), '');
    }
  }

  sections.push('═'.repeat(60));
  return sections.join('\n');
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(s: string, maxLen: number): string {
  const oneLine = s.replace(/\n/g, ' ').trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen - 1) + '…' : oneLine;
}

function effectLabel(v: number): string {
  if (v >= 0.5) return c.bold('(large effect)');
  if (v >= 0.3) return '(medium effect)';
  if (v >= 0.1) return '(small effect)';
  return c.dim('(negligible)');
}

function formatTable(header: string[], rows: string[][]): string {
  // Strip ANSI for width calculation
  const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

  const allRows = [header, ...rows];
  const colWidths = header.map((_, ci) =>
    Math.max(...allRows.map(r => stripAnsi(r[ci] ?? '').length)),
  );

  const pad = (s: string, w: number) => {
    const visible = stripAnsi(s).length;
    return s + ' '.repeat(Math.max(0, w - visible));
  };

  const headerLine = header.map((h, i) => c.bold(pad(h, colWidths[i]))).join('  ');
  const sepLine = colWidths.map(w => '─'.repeat(w)).join('──');
  const dataLines = rows.map(r =>
    r.map((cell, i) => pad(cell, colWidths[i])).join('  '),
  );

  return [headerLine, sepLine, ...dataLines].join('\n');
}
