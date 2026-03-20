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

export { createSandboxTools } from './sandbox-tools';
export { createArenaToolPackage, ARENA_TOOL_CONFIGS } from './tool-packages';
export { ENCOUNTERS, PATHS, BASELINE_PATH, classifyE4Approach } from './encounters';
export { executeEncounter, checkDeath } from './encounter-engine';
export type { AgentFn, AgentFnInput, AgentFnResult, AgentToolCall } from './encounter-engine';
export { buildCrossroadsPrompt, parseCrossroadsResponse, executeCrossroads } from './crossroads-engine';
export { createArenaRun } from './arena-run';
export { generateFeedbackItems, analyzeFeedbackResponse, checkE3Death } from './feedback-generator';
export type { FeedbackItem, FeedbackAnalysis } from './feedback-generator';
export { runExperiment, chiSquareTest, computeCramersV } from './experiment-runner';
export type { ExperimentConfig, ExperimentResult, ExperimentSummary } from './experiment-runner';
