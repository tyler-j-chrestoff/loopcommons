/**
 * Tournament fitness evaluation.
 *
 * Multi-dimensional: completion rate, mean score, efficiency (steps),
 * survival rate. Weighted composite for ranking.
 */

import type { TaskResult, AgentFitness } from './types';

/**
 * Fitness weights — completion dominates. Survival and efficiency
 * reduced so passive agents (do nothing, survive, few steps) can't win.
 */
const WEIGHTS = {
  completionRate: 0.45,
  meanScore: 0.25,
  survivalRate: 0.10,
  efficiency: 0.10,
  collateral: 0.10,
};

/** Max steps we'd expect; used to normalize efficiency to 0-1. */
const MAX_EXPECTED_STEPS = 20;

/**
 * Compute fitness for a single agent given its task results.
 */
export function computeAgentFitness(
  agentId: string,
  taskResults: TaskResult[],
): AgentFitness {
  if (taskResults.length === 0) {
    return {
      agentId,
      taskResults,
      fitnessScore: 0,
      metrics: {
        completionRate: 0,
        meanScore: 0,
        meanSteps: 0,
        survivalRate: 0,
        totalCost: 0,
        meanCollateral: 0,
      },
    };
  }

  const completionRate = taskResults.filter(t => t.resolved).length / taskResults.length;
  const meanScore = taskResults.reduce((sum, t) => sum + t.score, 0) / taskResults.length;
  const meanSteps = taskResults.reduce((sum, t) => sum + t.stepCount, 0) / taskResults.length;
  const survivalRate = taskResults.filter(t => !t.died).length / taskResults.length;
  const totalCost = taskResults.reduce((sum, t) => sum + t.costEstimate, 0);
  const meanCollateral = taskResults.reduce((sum, t) => sum + (t.collateral ?? 0), 0) / taskResults.length;

  // Normalize efficiency: fewer steps = higher score
  const efficiency = Math.max(0, 1 - meanSteps / MAX_EXPECTED_STEPS);

  // Collateral: inverted — less damage = higher fitness component
  const collateralScore = Math.max(0, 1 - meanCollateral);

  const fitnessScore =
    completionRate * WEIGHTS.completionRate +
    meanScore * WEIGHTS.meanScore +
    survivalRate * WEIGHTS.survivalRate +
    efficiency * WEIGHTS.efficiency +
    collateralScore * WEIGHTS.collateral;

  return {
    agentId,
    taskResults,
    fitnessScore: Math.max(0, Math.min(1, fitnessScore)),
    metrics: { completionRate, meanScore, meanSteps, survivalRate, totalCost, meanCollateral },
  };
}

/**
 * Rank a population by fitness score, descending.
 */
export function rankPopulation(fitness: AgentFitness[]): AgentFitness[] {
  return [...fitness].sort((a, b) => b.fitnessScore - a.fitnessScore);
}

/**
 * Select top N agents as survivors.
 */
export function selectSurvivors(fitness: AgentFitness[], count: number): string[] {
  const ranked = rankPopulation(fitness);
  return ranked.slice(0, count).map(f => f.agentId);
}
