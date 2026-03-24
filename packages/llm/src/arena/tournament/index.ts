/**
 * Tournament system — evolutionary selection over tool compositions.
 *
 * Re-exports all tournament modules for clean external API.
 */

export type {
  TournamentConfig,
  TournamentAgent,
  TournamentTrace,
  TournamentEvent,
  AgentFitness,
  TaskResult,
  GenerationResult,
  MutationRecord,
  CrossoverRecord,
  AgentOrigin,
  PopulationHealth,
} from './types';

export { createTournament } from './runner';
export { createTaskBattery, encounterResultToTaskResult } from './task-battery';
export type { TaskBattery } from './task-battery';
export { computeAgentFitness, rankPopulation, selectSurvivors } from './fitness';
export { mutateAdd, mutateRemove, mutateSwap, mutateAgent } from './mutation';
export { mergeMemoryStates, crossoverAgents } from './crossover';
export {
  createSeedAgent,
  createPopulationFromSeeds,
  applyMutations,
  applyCrossovers,
  buildNextGeneration,
} from './population';
export { createTournamentWriter } from './writer';
export type { TournamentWriter } from './writer';
export { createTraceWriter } from './trace-writer';
export type { TraceWriter, OnEncounterComplete } from './trace-writer';
export { computeConsistencyScore, applyConsistencyBonus } from './consistency-scoring';
export type { FamilyScores, ConsistencyResult } from './consistency-scoring';
export { createAnchor, verifyAnchor, detectDivergence } from './anchor-protocol';
export type { AnchorBattery, AnchorValidationResult, DivergenceResult } from './anchor-protocol';
export {
  computeMarginalContribution,
  selectSurvivorsWithNiches,
  computePopulationHealth,
  extractDeadLineages,
} from './community-fitness';
export type { DeadLineage } from './community-fitness';
