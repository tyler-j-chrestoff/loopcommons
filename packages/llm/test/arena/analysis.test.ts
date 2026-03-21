import { describe, it, expect } from 'vitest';
import {
  chiSquarePathDependence,
  permutationClusteringTest,
  mannWhitneyBaseline,
} from '../../src/arena/analysis';
import type { RunTrace, E4ApproachCategory } from '../../src/arena/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeTrace(overrides: Partial<RunTrace> = {}): RunTrace {
  return {
    runId: 'r1',
    pathId: 'path-1',
    startedAt: '2026-03-20T10:00:00.000Z',
    completedAt: '2026-03-20T10:01:00.000Z',
    steps: [],
    choicePoints: [],
    finalResult: { resolved: true, partial: false, score: 1.0, details: 'ok' },
    death: { dead: false, cause: null, details: null },
    e4ApproachCategory: 'observe-first',
    stateHashes: ['genesis'],
    chainHashes: ['genesis'],
    ...overrides,
  };
}

function makeTraces(
  pathDistributions: Record<string, Record<E4ApproachCategory, number>>,
): RunTrace[] {
  const traces: RunTrace[] = [];
  let counter = 0;
  for (const [pathId, dist] of Object.entries(pathDistributions)) {
    for (const [category, count] of Object.entries(dist)) {
      for (let i = 0; i < count; i++) {
        counter++;
        traces.push(makeTrace({
          runId: `${pathId}-${category}-${counter}`,
          pathId,
          e4ApproachCategory: category as E4ApproachCategory,
        }));
      }
    }
  }
  return traces;
}

// ---------------------------------------------------------------------------
// chiSquarePathDependence
// ---------------------------------------------------------------------------

describe('chiSquarePathDependence', () => {
  it('detects significant path dependence when distributions differ', () => {
    // Path-1 strongly observe-first, path-2 strongly act-first
    const traces = makeTraces({
      'path-1': { 'observe-first': 20, 'act-first': 2, 'systematic': 1, 'breadth-first': 0, 'targeted': 0 },
      'path-2': { 'observe-first': 2, 'act-first': 20, 'systematic': 1, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = chiSquarePathDependence(traces);
    expect(result.significant).toBe(true);
    expect(result.cramersV).toBeGreaterThan(0.3); // medium+ effect
    expect(result.pValue).toBeLessThan(0.05);
  });

  it('does not detect significance when distributions are identical', () => {
    const traces = makeTraces({
      'path-1': { 'observe-first': 10, 'act-first': 10, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
      'path-2': { 'observe-first': 10, 'act-first': 10, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = chiSquarePathDependence(traces);
    expect(result.significant).toBe(false);
    expect(result.cramersV).toBeLessThan(0.1);
  });

  it('returns null for single-path data', () => {
    const traces = makeTraces({
      'path-1': { 'observe-first': 10, 'act-first': 5, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = chiSquarePathDependence(traces);
    expect(result).toBeNull();
  });

  it('excludes traces with null approach category', () => {
    const traces = [
      ...makeTraces({
        'path-1': { 'observe-first': 10, 'act-first': 0, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
        'path-2': { 'observe-first': 0, 'act-first': 10, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
      }),
      makeTrace({ pathId: 'path-1', e4ApproachCategory: null }),
      makeTrace({ pathId: 'path-2', e4ApproachCategory: null }),
    ];

    const result = chiSquarePathDependence(traces);
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// permutationClusteringTest
// ---------------------------------------------------------------------------

describe('permutationClusteringTest', () => {
  it('returns p-values between 0 and 1', () => {
    const traces = makeTraces({
      'path-1': { 'observe-first': 15, 'act-first': 0, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
      'path-2': { 'observe-first': 0, 'act-first': 15, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = permutationClusteringTest(traces, 1000);
    expect(result.primacyP).toBeGreaterThanOrEqual(0);
    expect(result.primacyP).toBeLessThanOrEqual(1);
    expect(result.recencyP).toBeGreaterThanOrEqual(0);
    expect(result.recencyP).toBeLessThanOrEqual(1);
  });

  it('detects primacy effect when first tool acquired dominates behavior', () => {
    // Agents given inspect first → observe-first, agents given act first → act-first
    const traces = makeTraces({
      'path-1': { 'observe-first': 20, 'act-first': 0, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
      'path-2': { 'observe-first': 0, 'act-first': 20, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = permutationClusteringTest(traces, 5000);
    // Strong clustering by first tool → low primacy p-value
    expect(result.primacyP).toBeLessThan(0.05);
  });

  it('returns non-significant when no clustering pattern', () => {
    const traces = makeTraces({
      'path-1': { 'observe-first': 5, 'act-first': 5, 'systematic': 5, 'breadth-first': 5, 'targeted': 0 },
      'path-2': { 'observe-first': 5, 'act-first': 5, 'systematic': 5, 'breadth-first': 5, 'targeted': 0 },
    });

    const result = permutationClusteringTest(traces, 1000);
    expect(result.primacyP).toBeGreaterThan(0.05);
  });

  it('returns n (number of permutations run)', () => {
    const traces = makeTraces({
      'path-1': { 'observe-first': 5, 'act-first': 5, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
      'path-2': { 'observe-first': 5, 'act-first': 5, 'systematic': 0, 'breadth-first': 0, 'targeted': 0 },
    });

    const result = permutationClusteringTest(traces, 500);
    expect(result.n).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// mannWhitneyBaseline
// ---------------------------------------------------------------------------

describe('mannWhitneyBaseline', () => {
  it('detects that path traces differ from baseline', () => {
    // Path traces mostly observe-first (high score), baseline mostly act-first (low score)
    const pathTraces = Array.from({ length: 20 }, (_, i) =>
      makeTrace({
        runId: `p-${i}`,
        pathId: 'path-1',
        finalResult: { resolved: true, partial: false, score: 0.9, details: 'ok' },
      }),
    );
    const baselineTraces = Array.from({ length: 20 }, (_, i) =>
      makeTrace({
        runId: `b-${i}`,
        pathId: 'baseline',
        finalResult: { resolved: false, partial: true, score: 0.2, details: 'partial' },
      }),
    );

    const result = mannWhitneyBaseline(pathTraces, baselineTraces);
    expect(result.p).toBeLessThan(0.05);
    expect(result.direction).toBe('path>baseline');
  });

  it('returns direction as path<baseline when baseline is better', () => {
    const pathTraces = Array.from({ length: 20 }, (_, i) =>
      makeTrace({
        runId: `p-${i}`,
        finalResult: { resolved: false, partial: false, score: 0.1, details: 'fail' },
      }),
    );
    const baselineTraces = Array.from({ length: 20 }, (_, i) =>
      makeTrace({
        runId: `b-${i}`,
        finalResult: { resolved: true, partial: false, score: 0.9, details: 'ok' },
      }),
    );

    const result = mannWhitneyBaseline(pathTraces, baselineTraces);
    expect(result.direction).toBe('path<baseline');
  });

  it('returns non-significant when scores are similar', () => {
    const makeGroup = (prefix: string) =>
      Array.from({ length: 20 }, (_, i) =>
        makeTrace({
          runId: `${prefix}-${i}`,
          finalResult: { resolved: true, partial: false, score: 0.5, details: 'ok' },
        }),
      );

    const result = mannWhitneyBaseline(makeGroup('p'), makeGroup('b'));
    expect(result.p).toBeGreaterThan(0.05);
  });

  it('returns U statistic', () => {
    const pathTraces = [makeTrace({ finalResult: { resolved: true, partial: false, score: 0.8, details: '' } })];
    const baselineTraces = [makeTrace({ finalResult: { resolved: true, partial: false, score: 0.2, details: '' } })];

    const result = mannWhitneyBaseline(pathTraces, baselineTraces);
    expect(typeof result.U).toBe('number');
    expect(result.U).toBeGreaterThanOrEqual(0);
  });

  it('handles dead runs with score 0', () => {
    const pathTraces = Array.from({ length: 10 }, (_, i) =>
      makeTrace({
        runId: `p-${i}`,
        death: { dead: true, cause: 'capitulated', details: '' },
        finalResult: null,
      }),
    );
    const baselineTraces = Array.from({ length: 10 }, (_, i) =>
      makeTrace({
        runId: `b-${i}`,
        finalResult: { resolved: true, partial: false, score: 1.0, details: 'ok' },
      }),
    );

    const result = mannWhitneyBaseline(pathTraces, baselineTraces);
    expect(result.direction).toBe('path<baseline');
  });
});
