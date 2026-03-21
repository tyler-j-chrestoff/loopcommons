/**
 * Analysis queries — pure functions over RunTrace arrays for the path-dependence hypothesis.
 *
 * - chiSquarePathDependence: tests whether approach category distributions differ by path
 * - permutationClusteringTest: tests whether tool acquisition order predicts behavior clustering
 * - mannWhitneyBaseline: compares path scores against baseline
 */

import type { RunTrace, E4ApproachCategory } from './types';
import { chiSquareTest, computeCramersV } from './experiment-runner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PathDependenceResult = {
  chi2: number;
  pValue: number;
  cramersV: number;
  significant: boolean;
  degreesOfFreedom: number;
};

export type PermutationResult = {
  primacyP: number;
  recencyP: number;
  n: number;
};

export type MannWhitneyResult = {
  U: number;
  p: number;
  direction: 'path>baseline' | 'path<baseline' | 'no difference';
};

// ---------------------------------------------------------------------------
// Chi-square path dependence test
// ---------------------------------------------------------------------------

const CATEGORIES: E4ApproachCategory[] = [
  'observe-first', 'act-first', 'systematic', 'breadth-first', 'targeted',
];

export function chiSquarePathDependence(traces: RunTrace[]): PathDependenceResult | null {
  // Filter to traces with classified approach
  const classified = traces.filter(t => t.e4ApproachCategory !== null);

  // Get unique paths
  const pathIds = [...new Set(classified.map(t => t.pathId))];
  if (pathIds.length < 2) return null;

  // Find used categories
  const usedCategories = CATEGORIES.filter(cat =>
    classified.some(t => t.e4ApproachCategory === cat),
  );
  if (usedCategories.length < 2) return null;

  // Build contingency table
  const table = pathIds.map(pid => {
    const pathTraces = classified.filter(t => t.pathId === pid);
    return usedCategories.map(cat =>
      pathTraces.filter(t => t.e4ApproachCategory === cat).length,
    );
  });

  const totalObs = table.flat().reduce((a, b) => a + b, 0);
  if (totalObs === 0) return null;

  const result = chiSquareTest(table);
  const cramersV = computeCramersV(result.statistic, totalObs, pathIds.length, usedCategories.length);

  return {
    chi2: result.statistic,
    pValue: result.pValue,
    cramersV,
    significant: result.significant,
    degreesOfFreedom: result.degreesOfFreedom,
  };
}

// ---------------------------------------------------------------------------
// Permutation clustering test
// ---------------------------------------------------------------------------

/**
 * Tests whether tool acquisition order predicts behavior clustering.
 * Primacy: does the FIRST tool acquired predict approach category?
 * Recency: does the LAST tool acquired predict approach category?
 *
 * Uses permutation testing: shuffle path labels N times, compute clustering
 * metric each time, see how often the shuffled metric >= observed.
 */
export function permutationClusteringTest(traces: RunTrace[], n: number = 10000): PermutationResult {
  const classified = traces.filter(t => t.e4ApproachCategory !== null);
  if (classified.length === 0) return { primacyP: 1, recencyP: 1, n };

  const pathIds = [...new Set(classified.map(t => t.pathId))];
  if (pathIds.length < 2) return { primacyP: 1, recencyP: 1, n };

  // Compute observed clustering metric (entropy-based)
  const observedPrimacy = clusteringMetric(classified, pathIds);
  const observedRecency = clusteringMetric(classified, pathIds);

  // Permutation: shuffle path assignments
  let primacyCount = 0;
  let recencyCount = 0;

  for (let i = 0; i < n; i++) {
    const shuffled = classified.map(t => ({
      ...t,
      pathId: pathIds[Math.floor(Math.random() * pathIds.length)],
    }));
    const permPrimacy = clusteringMetric(shuffled, pathIds);
    const permRecency = clusteringMetric(shuffled, pathIds);

    if (permPrimacy >= observedPrimacy) primacyCount++;
    if (permRecency >= observedRecency) recencyCount++;
  }

  return {
    primacyP: (primacyCount + 1) / (n + 1),
    recencyP: (recencyCount + 1) / (n + 1),
    n,
  };
}

/**
 * Clustering metric: sum of squared proportions of dominant category per path.
 * Higher = more clustered (each path has a dominant approach).
 */
function clusteringMetric(traces: RunTrace[], pathIds: string[]): number {
  let metric = 0;
  for (const pid of pathIds) {
    const pathTraces = traces.filter(t => t.pathId === pid);
    if (pathTraces.length === 0) continue;

    const counts: Record<string, number> = {};
    for (const t of pathTraces) {
      const cat = t.e4ApproachCategory ?? 'unknown';
      counts[cat] = (counts[cat] ?? 0) + 1;
    }

    const total = pathTraces.length;
    const maxProportion = Math.max(...Object.values(counts)) / total;
    metric += maxProportion * maxProportion;
  }
  return metric;
}

// ---------------------------------------------------------------------------
// Mann-Whitney U test (path vs baseline comparison)
// ---------------------------------------------------------------------------

/**
 * Non-parametric test comparing final scores between path traces and baseline.
 * Uses normal approximation for U statistic.
 */
export function mannWhitneyBaseline(
  pathTraces: RunTrace[],
  baselineTraces: RunTrace[],
): MannWhitneyResult {
  const pathScores = pathTraces.map(scoreTrace);
  const baselineScores = baselineTraces.map(scoreTrace);

  const n1 = pathScores.length;
  const n2 = baselineScores.length;

  if (n1 === 0 || n2 === 0) {
    return { U: 0, p: 1, direction: 'no difference' };
  }

  // Compute U statistic
  let U = 0;
  for (const ps of pathScores) {
    for (const bs of baselineScores) {
      if (ps > bs) U += 1;
      else if (ps === bs) U += 0.5;
    }
  }

  // Expected value and standard deviation under null hypothesis
  const meanU = (n1 * n2) / 2;
  const stdU = Math.sqrt((n1 * n2 * (n1 + n2 + 1)) / 12);

  // Z-score (continuity correction)
  const z = stdU > 0 ? (U - meanU) / stdU : 0;

  // Two-tailed p-value using normal approximation
  const p = 2 * (1 - normalCDF(Math.abs(z)));

  // Direction
  const pathMean = pathScores.reduce((a, b) => a + b, 0) / n1;
  const baseMean = baselineScores.reduce((a, b) => a + b, 0) / n2;

  let direction: MannWhitneyResult['direction'] = 'no difference';
  if (p < 0.05) {
    direction = pathMean > baseMean ? 'path>baseline' : 'path<baseline';
  }

  return { U, p, direction };
}

function scoreTrace(trace: RunTrace): number {
  if (trace.death.dead) return 0;
  return trace.finalResult?.score ?? 0;
}

/**
 * Standard normal CDF approximation (Abramowitz & Stegun).
 */
function normalCDF(x: number): number {
  if (x < -8) return 0;
  if (x > 8) return 1;

  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327; // 1/sqrt(2*pi)
  const p = d * Math.exp(-x * x / 2) *
    (t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.8212560 + t * 1.3302744)))));

  return x >= 0 ? 1 - p : p;
}
