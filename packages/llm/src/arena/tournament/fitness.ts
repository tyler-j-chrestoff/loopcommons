/**
 * Tournament fitness evaluation.
 *
 * Multi-dimensional: completion rate, mean score, efficiency (steps),
 * survival rate. Weighted composite for ranking.
 */

import type { TaskResult, AgentFitness } from './types';

/** Fitness weights — completion and survival matter most. */
const WEIGHTS = {
  completionRate: 0.35,
  meanScore: 0.25,
  survivalRate: 0.20,
  efficiency: 0.20,
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
      },
    };
  }

  const completionRate = taskResults.filter(t => t.resolved).length / taskResults.length;
  const meanScore = taskResults.reduce((sum, t) => sum + t.score, 0) / taskResults.length;
  const meanSteps = taskResults.reduce((sum, t) => sum + t.stepCount, 0) / taskResults.length;
  const survivalRate = taskResults.filter(t => !t.died).length / taskResults.length;
  const totalCost = taskResults.reduce((sum, t) => sum + t.costEstimate, 0);

  // Normalize efficiency: fewer steps = higher score
  const efficiency = Math.max(0, 1 - meanSteps / MAX_EXPECTED_STEPS);

  const fitnessScore =
    completionRate * WEIGHTS.completionRate +
    meanScore * WEIGHTS.meanScore +
    survivalRate * WEIGHTS.survivalRate +
    efficiency * WEIGHTS.efficiency;

  return {
    agentId,
    taskResults,
    fitnessScore: Math.max(0, Math.min(1, fitnessScore)),
    metrics: { completionRate, meanScore, meanSteps, survivalRate, totalCost },
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
