import { describe, it, expect } from 'vitest';
import {
  computeAgentFitness,
  rankPopulation,
  selectSurvivors,
} from '../../../src/arena/tournament/fitness';
import type { TaskResult } from '../../../src/arena/tournament/types';

describe('tournament fitness', () => {
  const makeTasks = (overrides: Partial<TaskResult>[] = []): TaskResult[] => {
    const defaults: TaskResult[] = [
      { encounterId: 'E1', resolved: true, score: 0.8, stepCount: 3, died: false, costEstimate: 0.001 },
      { encounterId: 'E2', resolved: true, score: 0.6, stepCount: 5, died: false, costEstimate: 0.002 },
      { encounterId: 'E3', resolved: false, score: 0.2, stepCount: 8, died: true, costEstimate: 0.003 },
    ];
    return defaults.map((d, i) => ({ ...d, ...(overrides[i] ?? {}) }));
  };

  describe('computeAgentFitness', () => {
    it('computes completion rate correctly', () => {
      const result = computeAgentFitness('agent-1', makeTasks());
      expect(result.metrics.completionRate).toBeCloseTo(2 / 3);
    });

    it('computes survival rate correctly', () => {
      const result = computeAgentFitness('agent-1', makeTasks());
      expect(result.metrics.survivalRate).toBeCloseTo(2 / 3);
    });

    it('computes mean score correctly', () => {
      const result = computeAgentFitness('agent-1', makeTasks());
      expect(result.metrics.meanScore).toBeCloseTo((0.8 + 0.6 + 0.2) / 3);
    });

    it('computes mean steps correctly', () => {
      const result = computeAgentFitness('agent-1', makeTasks());
      expect(result.metrics.meanSteps).toBeCloseTo((3 + 5 + 8) / 3);
    });

    it('returns a composite fitnessScore between 0 and 1', () => {
      const result = computeAgentFitness('agent-1', makeTasks());
      expect(result.fitnessScore).toBeGreaterThanOrEqual(0);
      expect(result.fitnessScore).toBeLessThanOrEqual(1);
    });

    it('perfect agent scores higher than imperfect agent', () => {
      const perfect = computeAgentFitness('perfect', [
        { encounterId: 'E1', resolved: true, score: 1.0, stepCount: 1, died: false, costEstimate: 0.001 },
        { encounterId: 'E2', resolved: true, score: 1.0, stepCount: 1, died: false, costEstimate: 0.001 },
      ]);
      const imperfect = computeAgentFitness('imperfect', [
        { encounterId: 'E1', resolved: false, score: 0.2, stepCount: 10, died: true, costEstimate: 0.005 },
        { encounterId: 'E2', resolved: false, score: 0.1, stepCount: 10, died: true, costEstimate: 0.005 },
      ]);
      expect(perfect.fitnessScore).toBeGreaterThan(imperfect.fitnessScore);
    });

    it('handles empty task list', () => {
      const result = computeAgentFitness('empty', []);
      expect(result.fitnessScore).toBe(0);
      expect(result.metrics.completionRate).toBe(0);
    });
  });

  describe('rankPopulation', () => {
    it('sorts by fitnessScore descending', () => {
      const fitness = [
        computeAgentFitness('low', makeTasks([{ score: 0.1, resolved: false }])),
        computeAgentFitness('high', makeTasks([{ score: 1.0, resolved: true }])),
        computeAgentFitness('mid', makeTasks()),
      ];
      const ranked = rankPopulation(fitness);
      expect(ranked[0].agentId).toBe('high');
      expect(ranked[ranked.length - 1].agentId).toBe('low');
    });
  });

  describe('selectSurvivors', () => {
    it('returns top N agents by fitness', () => {
      const fitness = [
        computeAgentFitness('a', makeTasks([{ score: 1.0, resolved: true }])),
        computeAgentFitness('b', makeTasks([{ score: 0.1, resolved: false }])),
        computeAgentFitness('c', makeTasks([{ score: 0.5 }])),
      ];
      const survivors = selectSurvivors(fitness, 2);
      expect(survivors.length).toBe(2);
      expect(survivors).toContain('a');
      expect(survivors).not.toContain('b');
    });

    it('returns all agents if count >= population size', () => {
      const fitness = [
        computeAgentFitness('a', makeTasks()),
        computeAgentFitness('b', makeTasks()),
      ];
      const survivors = selectSurvivors(fitness, 5);
      expect(survivors.length).toBe(2);
    });
  });
});
