import { describe, it, expect } from 'vitest';
import {
  computeConsistencyScore,
  applyConsistencyBonus,
  type FamilyScores,
} from '../../../src/arena/tournament/consistency-scoring';

describe('consistency scoring', () => {
  describe('computeConsistencyScore', () => {
    it('returns 1.0 for identical scores across family', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.8, 0.8, 0.8],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBe(1.0);
    });

    it('returns 0.0 for maximally inconsistent scores (0 and 1)', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.0, 1.0],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBe(0.0);
    });

    it('returns high consistency for similar scores', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.7, 0.8, 0.75],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBeGreaterThan(0.8);
    });

    it('returns low consistency for divergent scores', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.0, 0.9, 0.3],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBeLessThan(0.5);
    });

    it('returns 1.0 for a single score (trivial consistency)', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.5],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBe(1.0);
    });

    it('returns 1.0 for empty scores', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.consistency).toBe(1.0);
    });

    it('includes the mean score in the result', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.6, 0.8, 1.0],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.meanScore).toBeCloseTo(0.8);
    });

    it('includes the variance in the result', () => {
      const familyScores: FamilyScores = {
        familyId: 'test-1',
        scores: [0.6, 0.8, 1.0],
      };
      const result = computeConsistencyScore(familyScores);
      expect(result.variance).toBeGreaterThan(0);
    });
  });

  describe('applyConsistencyBonus', () => {
    it('increases fitness for consistent agents', () => {
      const baseFitness = 0.6;
      const consistencyResults = [
        { familyId: 'f1', consistency: 1.0, meanScore: 0.8, variance: 0 },
      ];
      const adjusted = applyConsistencyBonus(baseFitness, consistencyResults);
      expect(adjusted).toBeGreaterThan(baseFitness);
    });

    it('decreases fitness for inconsistent agents', () => {
      const baseFitness = 0.6;
      const consistencyResults = [
        { familyId: 'f1', consistency: 0.0, meanScore: 0.5, variance: 0.25 },
      ];
      const adjusted = applyConsistencyBonus(baseFitness, consistencyResults);
      expect(adjusted).toBeLessThan(baseFitness);
    });

    it('is neutral for moderately consistent agents', () => {
      const baseFitness = 0.6;
      const consistencyResults = [
        { familyId: 'f1', consistency: 0.5, meanScore: 0.5, variance: 0.0625 },
      ];
      const adjusted = applyConsistencyBonus(baseFitness, consistencyResults);
      // Should be close to the base fitness (neutral zone around 0.5 consistency)
      expect(adjusted).toBeCloseTo(baseFitness, 1);
    });

    it('averages across multiple families', () => {
      const baseFitness = 0.6;
      const consistencyResults = [
        { familyId: 'f1', consistency: 1.0, meanScore: 0.8, variance: 0 },
        { familyId: 'f2', consistency: 0.0, meanScore: 0.5, variance: 0.25 },
      ];
      const adjusted = applyConsistencyBonus(baseFitness, consistencyResults);
      // Mixed consistency → roughly neutral
      expect(adjusted).toBeCloseTo(baseFitness, 1);
    });

    it('clamps result to [0, 1]', () => {
      const adjusted1 = applyConsistencyBonus(0.98, [
        { familyId: 'f1', consistency: 1.0, meanScore: 1.0, variance: 0 },
      ]);
      expect(adjusted1).toBeLessThanOrEqual(1.0);

      const adjusted2 = applyConsistencyBonus(0.02, [
        { familyId: 'f1', consistency: 0.0, meanScore: 0, variance: 0.25 },
      ]);
      expect(adjusted2).toBeGreaterThanOrEqual(0.0);
    });

    it('returns base fitness when no families are provided', () => {
      const adjusted = applyConsistencyBonus(0.6, []);
      expect(adjusted).toBe(0.6);
    });
  });
});
