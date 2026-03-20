import type { EncounterConfig, PathConfig, RunTrace, E4ApproachCategory } from './types';
import { createArenaRun } from './arena-run';
import { BASELINE_PATH } from './encounters';
import type { AgentFn } from './encounter-engine';

// ---------------------------------------------------------------------------
// Chi-square test of independence (pure implementation, no deps)
// ---------------------------------------------------------------------------

export type ChiSquareResult = {
  statistic: number;
  pValue: number;
  degreesOfFreedom: number;
  significant: boolean;
};

/**
 * Chi-square test of independence on an R×C contingency table.
 * observed[r][c] = count for row r, column c.
 */
export function chiSquareTest(observed: number[][]): ChiSquareResult {
  const rows = observed.length;
  const cols = observed[0].length;
  const total = observed.flat().reduce((a, b) => a + b, 0);

  const rowTotals = observed.map(row => row.reduce((a, b) => a + b, 0));
  const colTotals = Array.from({ length: cols }, (_, c) =>
    observed.reduce((sum, row) => sum + row[c], 0),
  );

  let statistic = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const expected = (rowTotals[r] * colTotals[c]) / total;
      if (expected > 0) {
        statistic += (observed[r][c] - expected) ** 2 / expected;
      }
    }
  }

  const df = (rows - 1) * (cols - 1);

  // Approximate p-value using chi-square CDF (Wilson-Hilferty approximation)
  const pValue = 1 - chiSquareCDF(statistic, df);

  return {
    statistic,
    pValue,
    degreesOfFreedom: df,
    significant: pValue < 0.05,
  };
}

/**
 * Cramer's V effect size.
 */
export function computeCramersV(chiSq: number, n: number, rows: number, cols: number): number {
  const k = Math.min(rows, cols) - 1;
  if (k === 0 || n === 0) return 0;
  return Math.sqrt(chiSq / (n * k));
}

/**
 * Chi-square CDF approximation using the regularized lower incomplete gamma function.
 * Uses the series expansion for the gamma function.
 */
function chiSquareCDF(x: number, k: number): number {
  if (x <= 0) return 0;
  const a = k / 2;
  const z = x / 2;
  return lowerIncompleteGamma(a, z) / gamma(a);
}

function gamma(n: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (n < 0.5) {
    return Math.PI / (Math.sin(Math.PI * n) * gamma(1 - n));
  }

  n -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (n + i);
  }
  const t = n + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, n + 0.5) * Math.exp(-t) * x;
}

function lowerIncompleteGamma(a: number, z: number): number {
  // Series expansion
  let sum = 0;
  let term = 1 / a;
  sum = term;
  for (let n = 1; n < 200; n++) {
    term *= z / (a + n);
    sum += term;
    if (Math.abs(term) < 1e-12 * Math.abs(sum)) break;
  }
  return Math.pow(z, a) * Math.exp(-z) * sum;
}

// ---------------------------------------------------------------------------
// Experiment runner
// ---------------------------------------------------------------------------

export type ExperimentConfig = {
  encounters: EncounterConfig[];
  paths: PathConfig[];
  trialsPerPath: number;
  baselineTrials: number;
  maxSteps: number;
  agentFn: AgentFn;
  llmFn: (prompt: string) => Promise<string>;
  temperature?: number;
};

export type ExperimentSummary = {
  totalRuns: number;
  deathRate: number;
  approachDistribution: Record<string, Record<E4ApproachCategory, number>>;
  chiSquare: ChiSquareResult | null;
  cramersV: number | null;
};

export type ExperimentResult = {
  traces: RunTrace[];
  summary: ExperimentSummary;
};

export async function runExperiment(config: ExperimentConfig): Promise<ExperimentResult> {
  const {
    encounters, paths, trialsPerPath, baselineTrials,
    maxSteps, agentFn, llmFn,
  } = config;

  const traces: RunTrace[] = [];
  let runCounter = 0;

  // Run each path
  for (const path of paths) {
    for (let trial = 0; trial < trialsPerPath; trial++) {
      runCounter++;
      const trace = await createArenaRun({
        encounters,
        path,
        agentFn,
        llmFn,
        maxSteps,
        runId: `${path.id}-trial-${trial + 1}-${runCounter}`,
      });
      traces.push(trace);
    }
  }

  // Run baseline
  for (let trial = 0; trial < baselineTrials; trial++) {
    runCounter++;
    const trace = await createArenaRun({
      encounters,
      path: BASELINE_PATH,
      agentFn,
      llmFn,
      maxSteps,
      runId: `baseline-trial-${trial + 1}-${runCounter}`,
      baselineTools: ['inspect', 'act'],
    });
    traces.push(trace);
  }

  const summary = computeSummary(traces, paths);
  return { traces, summary };
}

function computeSummary(traces: RunTrace[], paths: PathConfig[]): ExperimentSummary {
  const totalRuns = traces.length;
  const deaths = traces.filter(t => t.death.dead).length;
  const deathRate = totalRuns > 0 ? deaths / totalRuns : 0;

  // Build approach distribution per path
  const approachCategories: E4ApproachCategory[] = [
    'observe-first', 'act-first', 'systematic', 'breadth-first', 'targeted',
  ];
  const approachDistribution: Record<string, Record<E4ApproachCategory, number>> = {};

  for (const path of paths) {
    const pathTraces = traces.filter(t => t.pathId === path.id);
    const dist = {} as Record<E4ApproachCategory, number>;
    for (const cat of approachCategories) dist[cat] = 0;
    for (const trace of pathTraces) {
      if (trace.e4ApproachCategory) {
        dist[trace.e4ApproachCategory]++;
      }
    }
    approachDistribution[path.id] = dist;
  }

  // Chi-square if we have enough data
  let chiSquare: ChiSquareResult | null = null;
  let cramersV: number | null = null;

  const pathIds = paths.map(p => p.id);
  if (pathIds.length >= 2) {
    // Build contingency table: rows = paths, cols = approach categories
    const usedCategories = approachCategories.filter(cat =>
      pathIds.some(pid => (approachDistribution[pid]?.[cat] ?? 0) > 0),
    );

    if (usedCategories.length >= 2) {
      const table = pathIds.map(pid =>
        usedCategories.map(cat => approachDistribution[pid]?.[cat] ?? 0),
      );
      const totalObs = table.flat().reduce((a, b) => a + b, 0);

      if (totalObs > 0) {
        chiSquare = chiSquareTest(table);
        cramersV = computeCramersV(chiSquare.statistic, totalObs, pathIds.length, usedCategories.length);
      }
    }
  }

  return {
    totalRuns,
    deathRate,
    approachDistribution,
    chiSquare,
    cramersV,
  };
}
