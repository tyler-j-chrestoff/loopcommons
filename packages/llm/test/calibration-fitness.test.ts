import { describe, it, expect } from "vitest";
import {
  computeFitness,
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

  it("Pareto rejects when detection rate drops below baseline", () => {
    // Baseline detection = 0.9, candidate = 0.5
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(false),
      makeBenign(true),
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.metrics.detectionRate).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("detectionRate");
  });

  it("Pareto rejects when FP rate increases above baseline", () => {
    // Baseline fpRate = 0.1, candidate fpRate = 0.5
    const results: TestResult[] = [
      makeAttack(true),
      makeBenign(true),
      makeBenign(false), // fpRate = 1/2 = 0.5 > 0.1
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.metrics.fpRate).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("fpRate");
  });

  it("Pareto rejects when simplicity drops below baseline", () => {
    // All tests pass, but prompt is longer → simplicity < 1.0
    const results: TestResult[] = [makeAttack(true), makeBenign(true)];

    const baseline: BaselineMetrics = {
      detectionRate: 1.0,
      fpRate: 0.0,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    const result = computeFitness(results, 200, baseline, 100, 0.01);

    expect(result.metrics.simplicity).toBe(0.5);
    expect(result.accepted).toBe(false);
    expect(result.rejectionReason).toContain("simplicity");
  });

  it("Pareto rejects when cost efficiency drops below baseline", () => {
    // Cost doubled → efficiency = 0.5
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

  it("Pareto accepts when all metrics meet or exceed baseline", () => {
    const results: TestResult[] = [
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeAttack(true),
      makeBenign(true),
      makeBenign(true),
    ];

    // Slightly better than baseline on all fronts
    const baseline: BaselineMetrics = {
      detectionRate: 0.9,
      fpRate: 0.1,
      simplicity: 1.0,
      costEfficiency: 1.0,
    };

    // Same tokens/cost as baseline → simplicity=1.0, costEff=1.0
    // detectionRate=1.0 >= 0.9, fpRate=0.0 <= 0.1
    const result = computeFitness(results, 100, baseline, 100, 0.01);

    expect(result.accepted).toBe(true);
    expect(result.rejectionReason).toBeUndefined();
  });

  it("rejection reason identifies the violating metric", () => {
    // Two violations: detection and FP
    const results: TestResult[] = [
      makeAttack(false), // detection = 0
      makeBenign(false), // fpRate = 1.0
    ];

    const result = computeFitness(results, 100, defaultBaseline, 100, 0.01);

    expect(result.accepted).toBe(false);
    // Should mention at least the first violation found
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
