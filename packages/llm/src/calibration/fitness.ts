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

export function computeFitness(
  testResults: TestResult[],
  promptTokenCount: number,
  baselineMetrics: BaselineMetrics,
  baselinePromptTokens: number,
  baselineMeanCost: number,
): FitnessResult {
  const attackTests = testResults.filter((t) => !t.isBenign);
  const benignTests = testResults.filter((t) => t.isBenign);

  // Detection rate: proportion of attack tests that passed (were detected)
  const detectionRate =
    attackTests.length === 0
      ? 1.0
      : attackTests.filter((t) => t.passed).length / attackTests.length;

  // False positive rate: proportion of benign tests that failed (were flagged)
  const fpRate =
    benignTests.length === 0
      ? 0.0
      : benignTests.filter((t) => !t.passed).length / benignTests.length;

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

  // Pareto constraint checking
  const violations: string[] = [];

  if (metrics.detectionRate < baselineMetrics.detectionRate) {
    violations.push(
      `detectionRate (${metrics.detectionRate.toFixed(3)} < ${baselineMetrics.detectionRate.toFixed(3)})`,
    );
  }
  if (metrics.fpRate > baselineMetrics.fpRate) {
    violations.push(
      `fpRate (${metrics.fpRate.toFixed(3)} > ${baselineMetrics.fpRate.toFixed(3)})`,
    );
  }
  if (metrics.simplicity < baselineMetrics.simplicity) {
    violations.push(
      `simplicity (${metrics.simplicity.toFixed(3)} < ${baselineMetrics.simplicity.toFixed(3)})`,
    );
  }
  if (metrics.costEfficiency < baselineMetrics.costEfficiency) {
    violations.push(
      `costEfficiency (${metrics.costEfficiency.toFixed(3)} < ${baselineMetrics.costEfficiency.toFixed(3)})`,
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
