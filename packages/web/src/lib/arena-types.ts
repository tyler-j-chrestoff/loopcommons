/**
 * Arena visualization types — shared between API and components.
 */

export type ArenaEvent = {
  type: string;
  [key: string]: unknown;
};

export type RunSummary = {
  runId: string;
  pathId: string;
  startedAt: string;
  completedAt: string | null;
  isVictory: boolean;
  isDead: boolean;
  deathCause: string | null;
  stepCount: number;
  choicePointCount: number;
  e4ApproachCategory: string | null;
  pathLabel: string | null;
};

export type PathSummary = {
  runCount: number;
  victories: number;
  deaths: number;
  approachDistribution: Record<string, number>;
};

export type ArenaStats = {
  totalRuns: number;
  totalVictories: number;
  totalDeaths: number;
  pathSummaries: Record<string, PathSummary>;
};

export type ChoicePointEvent = {
  type: 'choice:point';
  encounterId: string;
  offeredTools: string[];
  currentTools: string[];
  selectedTool: string;
  droppedTool: string | null;
  confidenceScore: number;
  selfAssessment: string;
  acquisitionReasoning: string;
  sacrificeReasoning: string | null;
  forwardModel: string;
  memoryStateDump: string;
  stateHash: string;
  chainHash: string;
  promptRendered: string;
  responseRaw: string;
};

export type StepEvent = {
  type: 'encounter:step';
  encounterId: string;
  stepIndex: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  durationMs: number;
};

export type RunHeaderEvent = {
  type: 'run:header';
  runId: string;
  pathId: string;
  startedAt: string;
  startingStateHash: string;
  pathLabel: string;
};

export const TOOL_COLORS: Record<string, string> = {
  inspect: 'text-cyan-600',
  act: 'text-red-600',
  search: 'text-yellow-600',
  model: 'text-purple-600',
};

// ---------------------------------------------------------------------------
// Tournament types
// ---------------------------------------------------------------------------

export type TournamentAgentSummary = {
  id: string;
  tools: string[];
  origin: string;
  parentIds: string[];
  identity: string;
};

export type TournamentFitnessSummary = {
  agentId: string;
  fitnessScore: number;
  taskResults?: Array<{
    encounterId: string;
    resolved: boolean;
    score: number;
    stepCount: number;
    died: boolean;
    costEstimate: number;
  }>;
  metrics: {
    completionRate: number;
    meanScore: number;
    meanSteps: number;
    survivalRate: number;
    totalCost: number;
  };
};

export type TournamentGenerationSummary = {
  type: 'generation';
  generation: number;
  populationSize: number;
  agents: TournamentAgentSummary[];
  fitness: TournamentFitnessSummary[];
  survivors: string[];
  mutations: Array<{
    parentId: string;
    childId: string;
    type: string;
    toolAdded: string | null;
    toolRemoved: string | null;
  }>;
  crossovers: Array<{
    parent1Id: string;
    parent2Id: string;
    childId: string;
    memoryCounts: { parent1: number; parent2: number; merged: number };
  }>;
  durationMs: number;
};

export type TournamentCompleteSummary = {
  type: 'tournament_complete';
  tournamentId: string;
  generationsRun: number;
  bestFitness: number;
  winnerId: string | null;
  winnerTools: string[] | null;
  winnerOrigin: string | null;
  startedAt: string;
  completedAt: string;
};

export type TournamentData = {
  generations: TournamentGenerationSummary[];
  complete: TournamentCompleteSummary | null;
};

export const TOOL_FILL_COLORS: Record<string, string> = {
  inspect: '#0891b2',  // cyan-600
  act: '#dc2626',      // red-600
  search: '#ca8a04',   // yellow-600
  model: '#9333ea',    // purple-600
};

export const EVENT_SHAPES: Record<string, { shape: string; color: string }> = {
  'run:header': { shape: 'circle', color: 'bg-green-500' },
  'run:complete': { shape: 'circle', color: 'bg-green-500' },
  'run:death': { shape: 'circle', color: 'bg-red-500' },
  'choice:point': { shape: 'diamond', color: 'bg-yellow-500' },
  'encounter:start': { shape: 'square', color: 'bg-purple-500' },
  'encounter:result': { shape: 'square', color: 'bg-purple-500' },
  'encounter:step': { shape: 'dot', color: 'bg-cyan-500' },
  'agent:response': { shape: 'dot', color: 'bg-green-400' },
};

// ---------------------------------------------------------------------------
// Arena page component types
// ---------------------------------------------------------------------------

export type TournamentSummary = {
  id: string;
  status: string;
  generationCount: number;
  agentCount: number;
  bestFitness: number;
  winnerId: string | null;
  winnerTools: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type TaskResult = {
  encounterId: string;
  resolved: boolean;
  score: number;
  stepCount: number;
  died: boolean;
  costEstimate: number;
};

export type AgentSummary = { id: string; tools: string[] };

export type FitnessResult = {
  agentId: string;
  fitnessScore: number;
  taskResults: TaskResult[];
};

export type GenerationData = {
  generation: number;
  populationSize: number;
  agents: AgentSummary[];
  fitness: FitnessResult[];
};

export type TournamentDetail = {
  id: string;
  generations: GenerationData[];
  complete: {
    bestFitness: number;
    winnerId: string | null;
    winnerTools: string[] | null;
  } | null;
};

export const TOOL_BG: Record<string, string> = {
  inspect: 'bg-cyan-100 text-cyan-700',
  act: 'bg-red-100 text-red-700',
  search: 'bg-yellow-100 text-yellow-700',
  model: 'bg-purple-100 text-purple-700',
};
