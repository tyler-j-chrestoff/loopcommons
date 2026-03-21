import type {
  EncounterConfig,
  EncounterResult,
  DeathCause,
  DeathResult,
  StepRecord,
  Sandbox,
  PriorOutput,
} from './types';
import type { ToolDefinition } from '../tool';

// ---------------------------------------------------------------------------
// Agent function contract — dependency-injected, not coupled to createAgentCore
// ---------------------------------------------------------------------------

export type AgentToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  output: string;
};

export type AgentFnInput = {
  prompt: string;
  tools: ToolDefinition[];
  sandbox: Sandbox;
};

export type AgentFnResult = {
  response: string;
  toolCalls: AgentToolCall[];
};

export type AgentFn = (input: AgentFnInput) => Promise<AgentFnResult>;

// ---------------------------------------------------------------------------
// Encounter execution
// ---------------------------------------------------------------------------

export type ExecuteEncounterInput = {
  encounter: EncounterConfig;
  tools: ToolDefinition[];
  agentFn: AgentFn;
  maxSteps: number;
  priorOutputs?: PriorOutput[];
};

export type ExecuteEncounterOutput = {
  encounterResult: EncounterResult;
  steps: StepRecord[];
  response: string;
  death: DeathResult;
};

export async function executeEncounter(input: ExecuteEncounterInput): Promise<ExecuteEncounterOutput> {
  const { encounter, tools, agentFn, maxSteps, priorOutputs } = input;
  const startTime = Date.now();

  const sandbox = encounter.setup();
  const prompt = encounter.getPrompt(priorOutputs);

  const agentResult = await agentFn({ prompt, tools, sandbox });

  // Convert agent tool calls to StepRecords, truncating at maxSteps
  const steps: StepRecord[] = agentResult.toolCalls
    .slice(0, maxSteps)
    .map((call, i) => ({
      encounterId: encounter.id,
      stepIndex: i,
      toolName: call.toolName,
      toolInput: call.input,
      toolOutput: call.output,
      durationMs: Math.max(0, Math.round((Date.now() - startTime) / Math.max(1, agentResult.toolCalls.length))),
    }));

  const death = checkDeath(
    // Check death on ALL calls (not truncated) for iteration limit
    agentResult.toolCalls.length > maxSteps
      ? [...steps, ...Array(agentResult.toolCalls.length - maxSteps).fill(steps[0] ?? { encounterId: encounter.id, stepIndex: 0, toolName: '', toolInput: {}, toolOutput: '', durationMs: 0 })]
      : steps,
    maxSteps,
    agentResult.response,
  );

  const encounterResult = encounter.evaluate(sandbox, steps);

  // Evaluator-signaled death overrides structural death detection
  const finalDeath = encounterResult.dead
    ? { dead: true, cause: 'state_corruption' as DeathCause, details: encounterResult.details }
    : death;

  return { encounterResult, steps, response: agentResult.response, death: finalDeath };
}

// ---------------------------------------------------------------------------
// Death detection — deterministic, structural
// ---------------------------------------------------------------------------

const SURRENDER_PATTERNS = [
  /i give up/i,
  /i cannot solve/i,
  /i can't solve/i,
  /i'm unable to/i,
  /i surrender/i,
  /impossible to fix/i,
];

export function checkDeath(
  steps: StepRecord[],
  maxSteps: number,
  response: string,
): DeathResult {
  // Iteration limit
  if (steps.length > maxSteps) {
    return {
      dead: true,
      cause: 'iteration_limit',
      details: `Exceeded ${maxSteps} steps (took ${steps.length}).`,
    };
  }

  // Surrender signal
  if (SURRENDER_PATTERNS.some(p => p.test(response))) {
    return {
      dead: true,
      cause: 'surrender',
      details: 'Agent indicated it cannot solve the problem.',
    };
  }

  // Error loop: same tool producing errors 5+ times consecutively
  if (steps.length >= 5) {
    for (let i = 0; i <= steps.length - 5; i++) {
      const window = steps.slice(i, i + 5);
      const sameTool = window.every(s => s.toolName === window[0].toolName);
      const allErrors = window.every(s =>
        s.toolOutput.toLowerCase().startsWith('error') ||
        s.toolOutput.toLowerCase().includes('not found'),
      );
      if (sameTool && allErrors) {
        return {
          dead: true,
          cause: 'error_loop',
          details: `Tool "${window[0].toolName}" produced errors 5 consecutive times.`,
        };
      }
    }
  }

  return { dead: false, cause: null, details: null };
}
