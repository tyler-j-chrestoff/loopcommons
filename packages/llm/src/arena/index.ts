export type {
  Sandbox,
  ServiceState,
  IncidentRecord,
  ArenaToolId,
  PriorOutput,
  EncounterConfig,
  EncounterResult,
  DeathCause,
  DeathResult,
  CrossroadsDecision,
  ChoicePoint,
  ToolOffering,
  PathConfig,
  ArenaConfig,
  StepRecord,
  RunState,
  E4ApproachCategory,
  RunTrace,
} from './types';

export { createSandboxTools, createDoneTool } from './sandbox-tools';
export { createManaState, prepareStep, consumeMana } from './mana';
export type { ManaConfig, ManaState } from './mana';
export { createArenaToolPackage, ARENA_TOOL_CONFIGS } from './tool-packages';
export { ENCOUNTERS, PATHS, BASELINE_PATH, classifyE4Approach } from './encounters';
export { executeEncounter, checkDeath } from './encounter-engine';
export type { AgentFn, AgentFnInput, AgentFnResult, AgentToolCall } from './encounter-engine';
export { buildCrossroadsPrompt, parseCrossroadsResponse, executeCrossroads, CrossroadsParseError, CrossroadsRefusalError } from './crossroads-engine';
export { createArenaRun } from './arena-run';
export { generateFeedbackItems, analyzeFeedbackResponse, checkE3Death } from './feedback-generator';
export type { FeedbackItem, FeedbackAnalysis } from './feedback-generator';
export { runExperiment, chiSquareTest, computeCramersV } from './experiment-runner';
export type { ExperimentConfig, ExperimentResult, ExperimentSummary } from './experiment-runner';
export {
  extractLineageRecords,
  extractRunRecord,
  extractExecutionTraces,
  extractChoicePointRecords,
} from './trace-schema';
export type {
  AgentLineageRecord,
  RunRecord,
  ExecutionTraceRecord,
  ChoicePointRecord,
} from './trace-schema';
export { createArenaTraceWriter } from './trace-writer';
export type { ArenaTraceWriter, TraceEvent } from './trace-writer';
export { chiSquarePathDependence, permutationClusteringTest, mannWhitneyBaseline } from './analysis';
export type { PathDependenceResult, PermutationResult, MannWhitneyResult } from './analysis';
export { freezeExperimentConfig, loadExperimentFreeze } from './preregister';
export type { ExperimentFreeze, FreezeResult, FreezeInput } from './preregister';
export type { ArenaToolConfig } from './tool-packages';
export { createLiveAgentFn, createLiveLlmFn } from './live-agent';
export { computeSystemHealth } from './cascade-scoring';
export type { SystemHealthVector, CouplingPoint, ConfigCoherenceCheck } from './cascade-scoring';
export { parseEncounterYaml, compileEncounter, compileEncounterFromYaml } from './encounter-dsl';
export type { EncounterYaml } from './encounter-dsl';
export { generateFamily } from './encounter-family';
export type { VarianceSpec, EncounterFamily, Substitution } from './encounter-family';
export {
  formatRunTable,
  formatApproachDistribution,
  formatCrossroadsTree,
  formatStatsSummary,
  formatExperimentReport,
} from './viz';
