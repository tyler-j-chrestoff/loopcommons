import { createHash } from 'crypto';
import type {
  ArenaToolId,
  EncounterConfig,
  PathConfig,
  RunTrace,
  RunState,
  StepRecord,
  PriorOutput,
  ChoicePoint,
} from './types';
import { executeEncounter, type AgentFn } from './encounter-engine';
import { executeCrossroads } from './crossroads-engine';
import { createSandboxTools } from './sandbox-tools';

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

function computeStateHash(flexTools: ArenaToolId[]): string {
  return createHash('sha256')
    .update(JSON.stringify({ tools: [...flexTools].sort() }))
    .digest('hex')
    .slice(0, 16);
}

function computeChainHash(parentHash: string, choice: string): string {
  return createHash('sha256')
    .update(JSON.stringify({ parent: parentHash, choice }))
    .digest('hex')
    .slice(0, 16);
}

// ---------------------------------------------------------------------------
// Arena run orchestrator
// ---------------------------------------------------------------------------

export type CreateArenaRunInput = {
  encounters: EncounterConfig[];
  path: PathConfig;
  agentFn: AgentFn;
  llmFn: (prompt: string) => Promise<string>;
  maxSteps: number;
  runId: string;
  /** For baseline runs: the static tool set (no crossroads). */
  baselineTools?: ArenaToolId[];
};

export async function createArenaRun(input: CreateArenaRunInput): Promise<RunTrace> {
  const { encounters, path, agentFn, llmFn, maxSteps, runId, baselineTools } = input;
  const startedAt = new Date().toISOString();

  // Initialize state
  const state: RunState = {
    tools: ['memory_recall', 'memory_remember'],
    flexTools: baselineTools ? [...baselineTools] : [],
    memoryState: '',
    encounterOutputs: [],
    choicePoints: [],
    stateHash: computeStateHash(baselineTools ?? []),
    chainHash: 'genesis',
    dead: false,
  };

  if (baselineTools) {
    state.tools.push(...baselineTools);
  }

  const allSteps: StepRecord[] = [];
  const stateHashes: string[] = [state.stateHash];
  const chainHashes: string[] = [state.chainHash];

  for (const encounter of encounters) {
    if (state.dead) break;

    // Check if there's a crossroads before this encounter
    const offering = path.toolSequence.find(o => o.encounterBefore === encounter.id);
    if (offering) {
      const cp = await executeCrossroads({
        state,
        offeredTools: offering.offered as ArenaToolId[],
        mustDrop: offering.mustDrop ?? false,
        llmFn,
        computeStateHash: (tools) => computeStateHash(tools),
        computeChainHash: (parent, choice) => computeChainHash(parent, choice),
      });

      // Apply the choice to state
      if (cp.decision.droppedTool) {
        const dropIdx = state.flexTools.indexOf(cp.decision.droppedTool);
        if (dropIdx >= 0) state.flexTools.splice(dropIdx, 1);
        const toolIdx = state.tools.indexOf(cp.decision.droppedTool);
        if (toolIdx >= 0) state.tools.splice(toolIdx, 1);
      }
      state.flexTools.push(cp.decision.chosenTool);
      state.tools.push(cp.decision.chosenTool);
      state.stateHash = cp.stateHash;
      state.chainHash = cp.chainHash;
      state.choicePoints.push(cp);
      stateHashes.push(cp.stateHash);
      chainHashes.push(cp.chainHash);
    }

    // Create tools for this encounter's sandbox
    const sandbox = encounter.setup();
    const sandboxTools = createSandboxTools(sandbox)
      .filter(t => state.tools.includes(t.name));

    // Run the encounter
    const result = await executeEncounter({
      encounter: {
        ...encounter,
        setup: () => sandbox, // reuse the sandbox we already set up
      },
      tools: sandboxTools,
      agentFn,
      maxSteps,
      priorOutputs: state.encounterOutputs.length > 0 ? [...state.encounterOutputs] : undefined,
    });

    allSteps.push(...result.steps);
    state.encounterOutputs.push({
      encounterId: encounter.id,
      response: result.response,
      resolved: result.encounterResult.resolved,
    });

    // Check death
    if (result.death.dead) {
      state.dead = true;
      return {
        runId,
        pathId: path.id,
        startedAt,
        completedAt: new Date().toISOString(),
        steps: allSteps,
        choicePoints: state.choicePoints,
        finalResult: result.encounterResult,
        death: result.death,
        e4ApproachCategory: null,
        stateHashes,
        chainHashes,
      };
    }
  }

  // Classify E4 approach if we reached it
  const { classifyE4Approach } = await import('./encounters');
  const e4Category = classifyE4Approach(allSteps);

  const lastEncounter = encounters[encounters.length - 1];
  const lastOutput = state.encounterOutputs.find(o => o.encounterId === lastEncounter?.id);

  return {
    runId,
    pathId: path.id,
    startedAt,
    completedAt: new Date().toISOString(),
    steps: allSteps,
    choicePoints: state.choicePoints,
    finalResult: lastOutput
      ? { resolved: lastOutput.resolved, partial: false, score: lastOutput.resolved ? 1.0 : 0.0, details: lastOutput.response }
      : null,
    death: { dead: false, cause: null, details: null },
    e4ApproachCategory: e4Category,
    stateHashes,
    chainHashes,
  };
}
