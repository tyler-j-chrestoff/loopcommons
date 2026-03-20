/**
 * Arena types for the roguelike path-dependence experiment.
 *
 * Agents progress through encounters with tool choice points (crossroads).
 * All state lives in a virtual Sandbox — no real I/O.
 */

// ---------------------------------------------------------------------------
// Sandbox — virtual environment for encounters
// ---------------------------------------------------------------------------

export type ServiceState = {
  status: 'running' | 'stopped' | 'degraded';
  config: Record<string, string>;
  metrics: Record<string, number>;
  logs: string[];
};

export type IncidentRecord = {
  id: string;
  title: string;
  description: string;
  resolution: string;
  tags: string[];
};

export type Sandbox = {
  files: Map<string, string>;
  services: Map<string, ServiceState>;
  incidentDb: IncidentRecord[];
  dependencyGraph: Record<string, string[]>;
  commandLog: string[];
};

// ---------------------------------------------------------------------------
// Tools — four epistemological stances
// ---------------------------------------------------------------------------

export type ArenaToolId = 'inspect' | 'act' | 'search' | 'model';

// ---------------------------------------------------------------------------
// Encounters
// ---------------------------------------------------------------------------

export type PriorOutput = {
  encounterId: string;
  response: string;
  resolved: boolean;
};

export type EncounterResult = {
  resolved: boolean;
  partial: boolean;
  score: number;
  details: string;
};

export type EncounterConfig = {
  id: string;
  name: string;
  setup: () => Sandbox;
  getPrompt: (priorOutputs?: PriorOutput[]) => string;
  evaluate: (sandbox: Sandbox, toolCalls: StepRecord[]) => EncounterResult;
};

// ---------------------------------------------------------------------------
// Death
// ---------------------------------------------------------------------------

export type DeathCause =
  | 'iteration_limit'
  | 'surrender'
  | 'error_loop'
  | 'capitulated'
  | 'defensive'
  | 'incomplete';

export type DeathResult = {
  dead: boolean;
  cause: DeathCause | null;
  details: string | null;
};

// ---------------------------------------------------------------------------
// Crossroads — tool choice points
// ---------------------------------------------------------------------------

export type CrossroadsDecision = {
  selfAssessment: string;
  acquisitionReasoning: string;
  sacrificeReasoning: string | null;
  forwardModel: string;
  chosenTool: ArenaToolId;
  droppedTool: ArenaToolId | null;
  confidence: number;
};

export type ChoicePoint = {
  encounterId: string;
  offeredTools: ArenaToolId[];
  currentTools: ArenaToolId[];
  decision: CrossroadsDecision;
  memoryStateDump: string;
  stateHash: string;
  chainHash: string;
};

// ---------------------------------------------------------------------------
// Path configuration
// ---------------------------------------------------------------------------

export type ToolOffering = {
  offered: ArenaToolId[];
  encounterBefore: string;
  mustDrop?: boolean;
};

export type PathConfig = {
  id: string;
  label: string;
  toolSequence: ToolOffering[];
};

// ---------------------------------------------------------------------------
// Arena configuration
// ---------------------------------------------------------------------------

export type ArenaConfig = {
  encounters: EncounterConfig[];
  paths: PathConfig[];
  trialsPerPath: number;
  baselineTrials: number;
  temperature: number;
  maxStepsPerEncounter: number;
  flexSlots: number;
  model: string;
};

// ---------------------------------------------------------------------------
// Run state and trace
// ---------------------------------------------------------------------------

export type StepRecord = {
  encounterId: string;
  stepIndex: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  durationMs: number;
};

export type RunState = {
  tools: string[];
  flexTools: ArenaToolId[];
  memoryState: string;
  encounterOutputs: PriorOutput[];
  choicePoints: ChoicePoint[];
  stateHash: string;
  chainHash: string;
  dead: boolean;
};

export type E4ApproachCategory =
  | 'observe-first'
  | 'act-first'
  | 'systematic'
  | 'breadth-first'
  | 'targeted';

export type RunTrace = {
  runId: string;
  pathId: string;
  startedAt: string;
  completedAt: string;
  steps: StepRecord[];
  choicePoints: ChoicePoint[];
  finalResult: EncounterResult | null;
  death: DeathResult;
  e4ApproachCategory: E4ApproachCategory | null;
  stateHashes: string[];
  chainHashes: string[];
};
