import { describe, it, expect } from 'vitest';
import {
  runExperiment,
  chiSquareTest,
  computeCramersV,
  type ExperimentResult,
} from '../../src/arena/experiment-runner';
import type { EncounterConfig, PathConfig, RunTrace, E4ApproachCategory } from '../../src/arena/types';
import type { AgentFn } from '../../src/arena/encounter-engine';

function simpleEncounter(id: string): EncounterConfig {
  return {
    id, name: id,
    setup: () => ({
      files: new Map([['config.yaml', 'key: value']]),
      services: new Map(),
      incidentDb: [],
      dependencyGraph: {},
      commandLog: [],
    }),
    getPrompt: () => `Encounter ${id}`,
    evaluate: (sandbox) => ({
      resolved: sandbox.files.get('config.yaml')?.includes('fixed') ?? false,
      partial: false,
      score: sandbox.files.get('config.yaml')?.includes('fixed') ? 1.0 : 0.0,
      details: 'test',
    }),
  };
}

describe('chiSquareTest', () => {
  it('returns significant for clearly different distributions', () => {
    // 4 paths x 3 approach categories, clearly skewed
    const observed = [
      [25, 3, 2],  // path 1: mostly observe-first
      [2, 25, 3],  // path 2: mostly act-first
      [20, 5, 5],  // path 3: mostly observe-first
      [3, 20, 7],  // path 4: mostly act-first
    ];
    const result = chiSquareTest(observed);
    expect(result.significant).toBe(true);
    expect(result.pValue).toBeLessThan(0.05);
    expect(result.statistic).toBeGreaterThan(0);
  });

  it('returns non-significant for uniform distributions', () => {
    const observed = [
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
      [10, 10, 10],
    ];
    const result = chiSquareTest(observed);
    expect(result.significant).toBe(false);
    expect(result.pValue).toBeGreaterThan(0.05);
  });

  it('handles zero cells gracefully', () => {
    const observed = [
      [30, 0, 0],
      [0, 30, 0],
      [0, 0, 30],
      [10, 10, 10],
    ];
    const result = chiSquareTest(observed);
    expect(result.significant).toBe(true);
  });
});

describe('computeCramersV', () => {
  it('returns 0 for identical distributions', () => {
    const observed = [
      [10, 10],
      [10, 10],
    ];
    const v = computeCramersV(chiSquareTest(observed).statistic, 40, 2, 2);
    expect(v).toBeCloseTo(0, 1);
  });

  it('returns >0.25 for strong association', () => {
    const observed = [
      [25, 5],
      [5, 25],
    ];
    const chi = chiSquareTest(observed);
    const v = computeCramersV(chi.statistic, 60, 2, 2);
    expect(v).toBeGreaterThan(0.25);
  });
});

describe('runExperiment', () => {
  it('runs all paths and collects traces', async () => {
    const encounters = [simpleEncounter('e1'), simpleEncounter('e4')];
    const paths: PathConfig[] = [
      { id: 'p1', label: 'p1', toolSequence: [{ offered: ['inspect', 'act'], encounterBefore: 'e1' }] },
      { id: 'p2', label: 'p2', toolSequence: [{ offered: ['act', 'inspect'], encounterBefore: 'e1' }] },
    ];

    const result = await runExperiment({
      encounters,
      paths,
      trialsPerPath: 2,
      baselineTrials: 1,
      maxSteps: 30,
      agentFn: async ({ sandbox }) => {
        sandbox.files.set('config.yaml', 'key: fixed');
        return {
          response: 'done',
          toolCalls: Array.from({ length: 10 }, (_, i) => ({
            toolName: i % 2 === 0 ? 'inspect' : 'act',
            input: {},
            output: 'ok',
          })),
        };
      },
      llmFn: async (prompt) => {
        if (prompt.includes('inspect') && prompt.includes('act')) {
          return `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="inspect" confidence="0.8"/></crossroads>`;
        }
        return `<crossroads><self_assessment>x</self_assessment><acquisition_reasoning>y</acquisition_reasoning><forward_model>z</forward_model><decision tool="act" confidence="0.8"/></crossroads>`;
      },
    });

    expect(result.traces).toHaveLength(5); // 2 paths × 2 trials + 1 baseline
    expect(result.traces.filter(t => t.pathId === 'p1')).toHaveLength(2);
    expect(result.traces.filter(t => t.pathId === 'baseline')).toHaveLength(1);
    expect(result.summary).toBeDefined();
  });

  it('generates unique run IDs', async () => {
    const encounters = [simpleEncounter('e1')];
    const paths: PathConfig[] = [
      { id: 'p1', label: 'p1', toolSequence: [] },
    ];

    const result = await runExperiment({
      encounters,
      paths,
      trialsPerPath: 3,
      baselineTrials: 0,
      maxSteps: 30,
      agentFn: async ({ sandbox }) => {
        sandbox.files.set('config.yaml', 'fixed');
        return { response: 'ok', toolCalls: [] };
      },
      llmFn: async () => '',
    });

    const ids = result.traces.map(t => t.runId);
    expect(new Set(ids).size).toBe(3);
  });
});
