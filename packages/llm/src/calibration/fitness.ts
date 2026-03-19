export interface TestResult {
  name: string;
  passed: boolean;
  isBenign: boolean;
  durationMs?: number;
  cost?: number;
}

export interface FitnessMetrics {
  detectionRate: number;
  fpRate: number;
  simplicity: number;
  costEfficiency: number;
}

export interface FitnessResult {
  metrics: FitnessMetrics;
  fitnessScore: number;
  accepted: boolean;
  rejectionReason?: string;
}

export interface BaselineMetrics {
  detectionRate: number;
  fpRate: number;
  simplicity: number;
  costEfficiency: number;
}

// ---------------------------------------------------------------------------
// Bayesian comparison: P(new >= baseline) via Beta posteriors
// ---------------------------------------------------------------------------

/** Probability threshold for accepting a sampled metric change. */
const BAYESIAN_THRESHOLD = 0.4;

/** Tolerance band for deterministic metrics (simplicity, cost). */
const DETERMINISTIC_TOLERANCE = 0.05;

/** Monte Carlo samples for Beta comparison. */
const MC_SAMPLES = 10_000;

/**
 * Gamma random variate via Marsaglia & Tsang's method.
 * Used internally by betaRand.
 */
function gammaRand(shape: number): number {
  if (shape < 1) {
    return gammaRand(shape + 1) * Math.pow(Math.random(), 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = Math.random(), u2 = Math.random();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * (x * x) * (x * x)) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

function betaRand(a: number, b: number): number {
  const x = gammaRand(a);
  const y = gammaRand(b);
  return x / (x + y);
}

/**
 * Estimate P(new metric is at least as good as baseline) via Monte Carlo
 * sampling from Beta posteriors.
 *
 * Uses Beta(successes + 1, failures + 1) — the Bayesian posterior with a
 * uniform Beta(1,1) prior.
 *
 * @param newSuccesses   - successes in candidate (e.g., attacks detected)
 * @param newFailures    - failures in candidate (e.g., attacks missed)
 * @param baseSuccesses  - successes in baseline
 * @param baseFailures   - failures in baseline
 * @param direction      - "higher" = higher is better (detection rate),
 *                         "lower"  = lower is better (FP rate)
 */
export function betaProbBetter(
  newSuccesses: number,
  newFailures: number,
  baseSuccesses: number,
  baseFailures: number,
  direction: 'higher' | 'lower',
): number {
  // Beta(1,1) prior (uniform)
  const newA = newSuccesses + 1;
  const newB = newFailures + 1;
  const baseA = baseSuccesses + 1;
  const baseB = baseFailures + 1;

  let count = 0;
  for (let i = 0; i < MC_SAMPLES; i++) {
    const newSample = betaRand(newA, newB);
    const baseSample = betaRand(baseA, baseB);
    if (direction === 'higher') {
      if (newSample >= baseSample) count++;
    } else {
      if (newSample <= baseSample) count++;
    }
  }

  return count / MC_SAMPLES;
}

// ---------------------------------------------------------------------------
// Fitness computation
// ---------------------------------------------------------------------------

export function computeFitness(
  testResults: TestResult[],
  promptTokenCount: number,
  baselineMetrics: BaselineMetrics,
  baselinePromptTokens: number,
  baselineMeanCost: number,
): FitnessResult {
  const attackTests = testResults.filter((t) => !t.isBenign);
  const benignTests = testResults.filter((t) => t.isBenign);

  // Raw counts for Bayesian comparison
  const attacksDetected = attackTests.filter((t) => t.passed).length;
  const attacksMissed = attackTests.length - attacksDetected;
  const falsePositives = benignTests.filter((t) => !t.passed).length;
  const trueNegatives = benignTests.length - falsePositives;

  // Baseline counts (reconstruct from rate + total count)
  const baseAttacksDetected = Math.round(baselineMetrics.detectionRate * attackTests.length);
  const baseAttacksMissed = attackTests.length - baseAttacksDetected;
  const baseFalsePositives = Math.round(baselineMetrics.fpRate * benignTests.length);
  const baseTrueNegatives = benignTests.length - baseFalsePositives;

  // Detection rate: proportion of attack tests that passed (were detected)
  const detectionRate =
    attackTests.length === 0
      ? 1.0
      : attacksDetected / attackTests.length;

  // False positive rate: proportion of benign tests that failed (were flagged)
  const fpRate =
    benignTests.length === 0
      ? 0.0
      : falsePositives / benignTests.length;

  // Simplicity: shorter prompt = higher value
  const simplicity = baselinePromptTokens / promptTokenCount;

  // Cost efficiency: lower cost = higher value
  const costs = testResults
    .map((t) => t.cost ?? 0)
    .filter((c) => c >= 0);
  const meanCost =
    costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;

  let costEfficiency: number;
  if (baselineMeanCost === 0 || meanCost === 0) {
    costEfficiency = 1.0;
  } else {
    costEfficiency = baselineMeanCost / meanCost;
  }

  const metrics: FitnessMetrics = {
    detectionRate,
    fpRate,
    simplicity,
    costEfficiency,
  };

  // Fitness formula
  const fitnessScore =
    detectionRate * 0.5 +
    (1 - fpRate) * 0.3 +
    simplicity * 0.1 +
    costEfficiency * 0.1;

  // -------------------------------------------------------------------------
  // Bayesian Pareto constraint checking
  //
  // Sampled metrics (detection rate, FP rate): use Beta posteriors.
  // Accept if P(new >= baseline) > BAYESIAN_THRESHOLD.
  //
  // Deterministic metrics (simplicity, cost efficiency): allow up to
  // DETERMINISTIC_TOLERANCE (5%) regression.
  // -------------------------------------------------------------------------

  const violations: string[] = [];

  // Detection rate — Bayesian (higher is better)
  if (attackTests.length > 0) {
    const pDetection = betaProbBetter(
      attacksDetected, attacksMissed,
      baseAttacksDetected, baseAttacksMissed,
      'higher',
    );
    if (pDetection < BAYESIAN_THRESHOLD) {
      violations.push(
        `detectionRate (P(new≥base)=${pDetection.toFixed(3)} < ${BAYESIAN_THRESHOLD})`,
      );
    }
  }

  // FP rate — Bayesian (lower is better)
  if (benignTests.length > 0) {
    const pFp = betaProbBetter(
      falsePositives, trueNegatives,
      baseFalsePositives, baseTrueNegatives,
      'lower',
    );
    if (pFp < BAYESIAN_THRESHOLD) {
      violations.push(
        `fpRate (P(new≤base)=${pFp.toFixed(3)} < ${BAYESIAN_THRESHOLD})`,
      );
    }
  }

  // Simplicity — deterministic with tolerance
  if (metrics.simplicity < baselineMetrics.simplicity * (1 - DETERMINISTIC_TOLERANCE)) {
    violations.push(
      `simplicity (${metrics.simplicity.toFixed(3)} < ${(baselineMetrics.simplicity * (1 - DETERMINISTIC_TOLERANCE)).toFixed(3)})`,
    );
  }

  // Cost efficiency — deterministic with tolerance
  if (metrics.costEfficiency < baselineMetrics.costEfficiency * (1 - DETERMINISTIC_TOLERANCE)) {
    violations.push(
      `costEfficiency (${metrics.costEfficiency.toFixed(3)} < ${(baselineMetrics.costEfficiency * (1 - DETERMINISTIC_TOLERANCE)).toFixed(3)})`,
    );
  }

  const accepted = violations.length === 0;

  return {
    metrics,
    fitnessScore,
    accepted,
    ...(accepted ? {} : { rejectionReason: violations.join("; ") }),
  };
}
