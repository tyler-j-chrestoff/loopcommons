import { describe, it, expect } from "vitest";
import {
  computeFitness,
  betaProbBetter,
  type TestResult,
  type BaselineMetrics,
} from "../src/calibration/fitness.js";

function makeAttack(passed: boolean): TestResult {
  return { name: "attack", passed, isBenign: false, cost: 0.01 };
}

function makeBenign(passed: boolean): TestResult {
  return { name: "benign", passed, isBenign: true, cost: 0.01 };
}

const defaultBaseline: BaselineMetrics = {
  detectionRate: 0.9,
  fpRate: 0.1,
  simplicity: 1.0,
  costEfficiency: 1.0,
};

describe("betaProbBetter", () => {
  it("returns ~0.70 for 15/16 vs 14/16 (higher is better)", () => {
    const p = betaProbBetter(15, 1, 14, 2, "higher");
    expect(p).toBeGreaterThan(0.60);
    expect(p).toBeLessThan(0.80);
  });

  it("returns ~0.50 for identical counts", () => {
    const p = betaProbBetter(10, 5, 10, 5, "higher");
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });

  it("returns ~0.95+ for clearly better (15/16 vs 5/16)", () => {
    const p = betaProbBetter(15, 1, 5, 11, "higher");
    expect(p).toBeGreaterThan(0.95);
  });

  it("returns ~0.05 for clearly worse (5/16 vs 15/16)", () => {
    const p = betaProbBetter(5, 11, 15, 1, "higher");
    expect(p).toBeLessThan(0.10);
  });

  it("works in 'lower is better' mode for FP rate", () => {
    // New has 0 FPs out of 4, baseline has 1 FP out of 4
    // P(new FP rate <= baseline FP rate) should be high
    const p = betaProbBetter(0, 4, 1, 3, "lower");
    expect(p).toBeGreaterThan(0.70);
  });

  it("handles zero counts with Beta(1,1) prior", () => {
    // 0 successes, 0 failures → Beta(1, 1) = uniform
    const p = betaProbBetter(0, 0, 0, 0, "higher");
    expect(p).toBeGreaterThan(0.45);
    expect(p).toBeLessThan(0.55);
  });
});

describe("computeFitness", () => {
  it("computes perfect fitness when all tests pass", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeBenign(true),
      makeBenign(true),
    ];
    const promptTokens = 100;
    const baselinePromptTokens = 100;
    const baselineMeanCost = 0.01;

    const result = computeFitness(
      results,
      promptTokens,
      defaultBaseline,
      baselinePromptTokens,
      baselineMeanCost,
    );

    expect(result.metrics.detectionRate).toBe(1.0);
    expect(result.metrics.fpRate).toBe(0.0);
    expect(result.metrics.simplicity).toBe(1.0);
    expect(result.metrics.costEfficiency).toBe(1.0);
    // fitnessScore = 1.0*0.5 + (1-0)*0.3 + 1.0*0.1 + 1.0*0.1 = 1.0
    expect(result.fitnessScore).toBe(1.0);
    expect(result.accepted).toBe(true);
  });

  it("computes detection rate correctly", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeAttack(false), // missed
      makeBenign(true),
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.metrics.detectionRate).toBe(0.75);
  });

  it("computes false positive rate correctly", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeBenign(true),
      makeBenign(true),
      makeBenign(false), // false positive
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    // 1 out of 3 benign tests failed = FP rate 1/3
    expect(result.metrics.fpRate).toBeCloseTo(1 / 3, 5);
  });

  it("computes simplicity relative to baseline", () => {
    const results: TestResult[] = [makeAttack(true), makeBenign(true)];

    // Prompt is half the baseline tokens → simplicity = 100/50 = 2.0
    const result = computeFitness(results, 50, defaultBaseline, 100, 0.01);
    expect(result.metrics.simplicity).toBe(2.0);

    // Prompt is double the baseline → simplicity = 100/200 = 0.5
    const result2 = computeFitness(results, 200, defaultBaseline, 100, 0.01);
    expect(result2.metrics.simplicity).toBe(0.5);
  });

  it("computes cost efficiency relative to baseline", () => {
    const results: TestResult[] = [
      { name: "a1", passed: true, isBenign: false, cost: 0.005 },
      { name: "b1", passed: true, isBenign: true, cost: 0.005 },
    ];

    // Mean cost = 0.005, baseline = 0.01 → efficiency = 0.01/0.005 = 2.0
    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);
    expect(result.metrics.costEfficiency).toBe(2.0);
  });

  it("applies fitness formula correctly", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(true),
      makeAttack(false), // detection = 2/3
      makeBenign(true),
      makeBenign(false), // fpRate = 1/2
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    const dr = 2 / 3;
    const fp = 1 / 2;
    const simp = 1.0;
    const cost = 1.0;
    const expected = dr * 0.5 + (1 - fp) * 0.3 + simp * 0.1 + cost * 0.1;

    expect(result.fitnessScore).toBeCloseTo(expected, 10);
  });

  // -----------------------------------------------------------------------
  // Bayesian Pareto constraints
  // -----------------------------------------------------------------------

  it("Bayesian: accepts small detection rate drop with high P(better)", () => {
    // Baseline: 14/16 detected. Candidate: 15/16 detected.
    // Point estimate: 0.9375 > 0.875 — clearly better.
    // But even 13/16 vs 14/16 should be accepted if P(new >= baseline) > threshold.
    const baselineCounts: BaselineMetrics = {
      detectionRate: 0.875, // 14/16
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    // Candidate: 15/16 attacks detected, prompt slightly longer
    const results: TestResult[] = [];
    for (let i = 0; i < 15; i++) results.push(makeAttack(true));
    results.push(makeAttack(false));
    results.push(makeBenign(true));
    results.push(makeBenign(true));

    // Prompt is 3% longer → simplicity = 0.97
    const result = computeFitness(results, 103, baselineCounts, 100, 0.01);

    expect(result.metrics.detectionRate).toBe(15 / 16);
    expect(result.metrics.simplicity).toBeCloseTo(0.971, 2);
    // Under Bayesian model: P(new detection >= baseline) ≈ 0.70, simplicity within 5% tolerance
    expect(result.accepted).toBe(true);
  });

  it("Bayesian: rejects large detection rate drop", () => {
    // Baseline: 14/16. Candidate: 8/16 — clearly worse.
    const results: TestResult[] = [];
    for (let i = 0; i < 8; i++) results.push(makeAttack(true));
    for (let i = 0; i < 8; i++) results.push(makeAttack(false));
    results.push(makeBenign(true));

    const baseline: BaselineMetrics = {
      detectionRate: 0.875,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.metrics.detectionRate).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("detectionRate");
  });

  it("Bayesian: rejects large FP rate increase", () => {
    // Baseline fpRate = 0.0, candidate fpRate = 0.5 — clearly worse
    const results: TestResult[] = [
      makeAttack(true),
      makeBenign(true),
      makeBenign(false), // fpRate = 1/2 = 0.5
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.metrics.fpRate).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("fpRate");
  });

  it("Bayesian: accepts simplicity within 5% tolerance", () => {
    const results: TestResult[] = [makeAttack(true), makeBenign(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    // 4% longer → simplicity = 0.96, within 5% tolerance
    const result = computeFitness(results, 104, baseline, 100, 0.01);

    expect(result.metrics.simplicity).toBeCloseTo(0.962, 2);
    expect(result.accepted).toBe(true);
  });

  it("Bayesian: rejects simplicity beyond 5% tolerance", () => {
    const results: TestResult[] = [makeAttack(true), makeBenign(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    // 50% longer → simplicity = 0.67, well beyond tolerance
    const result = computeFitness(results, 150, baseline, 100, 0.01);

    expect(result.metrics.simplicity).toBeCloseTo(0.667, 2);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("simplicity");
  });

  it("Bayesian: rejects cost efficiency beyond 5% tolerance", () => {
    const results: TestResult[] = [
      { name: "a1", passed: true, isBenign: false, cost: 0.02 },
      { name: "b1", passed: true, isBenign: true, cost: 0.02 },
    ];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.metrics.costEfficiency).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("costEfficiency");
  });

  it("Bayesian: accepts when all metrics meet or exceed baseline", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeBenign(true),
      makeBenign(true),
    ];

    const baseline: BaselineMetrics = {
      detectionRate: 0.9,
      fpRate: 0.1,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.accepted).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
  });

  it("rejection reason identifies the violating metric", () => {
    // Two violations: detection and FP — large enough to be definitive
    const results: TestResult[] = [];
    for (let i = 0; i < 8; i++) results.push(makeAttack(false)); // 0% detection
    results.push(makeBenign(false)); // 100% FP

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toBeDefined();
    expect(
      result.rejectionReason!.includes("detectionRate") ||
        result.rejectionReason!.includes("fpRate"),
    ).toBe(true);
  });

  it("handles edge case: no attack tests", () => {
    const results: TestResult[] = [makeBenign(true), makeBenign(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.metrics.detectionRate).toBe(1.0);
  });

  it("handles edge case: no benign tests", () => {
    const results: TestResult[] = [makeAttack(true), makeAttack(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.metrics.fpRate).toBe(0.0);
  });

  it("handles edge case: zero baseline cost", () => {
    const results: TestResult[] = [makeAttack(true), makeBenign(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    // baselineMeanCost = 0 → costEfficiency defaults to 1.0
    const result = computeFitness(results, 100, baseline, 100, 0);

    expect(result.metrics.costEfficiency).toBe(1.0);
  });
});
