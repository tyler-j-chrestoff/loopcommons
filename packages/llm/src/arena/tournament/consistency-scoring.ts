/**
 * Consistency scoring for encounter families.
 *
 * Measures how uniformly an agent performs across surface variants
 * of the same structural encounter. Low variance = genuine understanding.
 * High variance = surface memorization.
 *
 * Applied as a bonus/penalty to base fitness (±10% max).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FamilyScores = {
  familyId: string;
  scores: number[];
};

export type ConsistencyResult = {
  familyId: string;
  consistency: number;
  meanScore: number;
  variance: number;
};

// ---------------------------------------------------------------------------
// Core: compute consistency for one family
// ---------------------------------------------------------------------------

export function computeConsistencyScore(familyScores: FamilyScores): ConsistencyResult {
  const { familyId, scores } = familyScores;

  if (scores.length <= 1) {
    return {
      familyId,
      consistency: 1.0,
      meanScore: scores[0] ?? 0,
      variance: 0,
    };
  }

  const meanScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, s) => sum + (s - meanScore) ** 2, 0) / scores.length;

  // Max possible variance for scores in [0,1] is 0.25 (all 0s and 1s).
  // Consistency = 1 - (variance / 0.25), clamped to [0, 1].
  const consistency = Math.max(0, Math.min(1, 1 - variance / 0.25));

  return { familyId, consistency, meanScore, variance };
}

// ---------------------------------------------------------------------------
// Apply consistency as fitness modifier
// ---------------------------------------------------------------------------

const MAX_BONUS = 0.10;

export function applyConsistencyBonus(
  baseFitness: number,
  consistencyResults: ConsistencyResult[],
): number {
  if (consistencyResults.length === 0) return baseFitness;

  const avgConsistency =
    consistencyResults.reduce((sum, r) => sum + r.consistency, 0) / consistencyResults.length;

  // Map consistency [0, 1] to modifier [-MAX_BONUS, +MAX_BONUS]
  // 0.5 consistency → 0 modifier (neutral)
  const modifier = (avgConsistency - 0.5) * 2 * MAX_BONUS;

  return Math.max(0, Math.min(1, baseFitness + modifier));
}
