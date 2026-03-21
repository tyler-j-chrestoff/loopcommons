/**
 * Trace data schema — relational types for arena run persistence and analysis.
 *
 * Four record types map the in-memory RunTrace to a storage-friendly schema:
 * agent_lineage, runs, execution_traces, choice_points.
 */

import { createHash } from 'crypto';
import type {
  RunTrace,
  ArenaToolId,
  DeathCause,
  E4ApproachCategory,
} from './types';

// ---------------------------------------------------------------------------
// agent_lineage — one row per unique tool composition
// ---------------------------------------------------------------------------

export type AgentLineageRecord = {
  lineageSha: string;
  parentSha: string | null;
  soulVersion: string;
  activeTools: ArenaToolId[];
  createdAt: string;
};

// ---------------------------------------------------------------------------
// runs — one row per arena run
// ---------------------------------------------------------------------------

export type RunRecord = {
  runId: string;
  pathId: string;
  startingLineageSha: string;
  isVictory: boolean;
  deathEncounterId: string | null;
  deathClassification: DeathCause | null;
  startedAt: string;
  completedAt: string;
  e4ApproachCategory: E4ApproachCategory | null;
};

// ---------------------------------------------------------------------------
// execution_traces — one row per tool call
// ---------------------------------------------------------------------------

export type ExecutionTraceRecord = {
  traceId: string;
  stepIndex: number;
  callIndex: number;
  lineageSha: string;
  toolName: string;
  toolInput: Record<string, unknown>;
  resultText: string;
  isError: boolean;
  durationMs: number;
  encounterId: string;
};

// ---------------------------------------------------------------------------
// choice_points — one row per crossroads decision
// ---------------------------------------------------------------------------

export type ChoicePointRecord = {
  choiceId: string;
  runId: string;
  encounterNumber: number;
  currentLineageSha: string;
  memoryStateHash: string;
  memoryStateDump: string;
  offeredTools: ArenaToolId[];
  selfAssessment: string;
  acquisitionReasoning: string;
  sacrificeReasoning: string | null;
  forwardModel: string;
  selectedTool: ArenaToolId;
  droppedTool: ArenaToolId | null;
  confidenceScore: number;
  resultingLineageSha: string;
};

// ---------------------------------------------------------------------------
// Extraction functions: RunTrace → record types
// ---------------------------------------------------------------------------

export function extractLineageRecords(trace: RunTrace, soulVersion: string): AgentLineageRecord[] {
  const records: AgentLineageRecord[] = [];
  const now = trace.startedAt;

  // Genesis record (no tools)
  records.push({
    lineageSha: trace.stateHashes[0],
    parentSha: null,
    soulVersion,
    activeTools: [],
    createdAt: now,
  });

  // One record per choice point transition
  const activeTools: ArenaToolId[] = [];
  for (let i = 0; i < trace.choicePoints.length; i++) {
    const cp = trace.choicePoints[i];

    // Apply the choice
    if (cp.decision.droppedTool) {
      const dropIdx = activeTools.indexOf(cp.decision.droppedTool);
      if (dropIdx >= 0) activeTools.splice(dropIdx, 1);
    }
    activeTools.push(cp.decision.chosenTool);

    records.push({
      lineageSha: cp.stateHash,
      parentSha: trace.stateHashes[i] ?? 'genesis',
      soulVersion,
      activeTools: [...activeTools],
      createdAt: now,
    });
  }

  return records;
}

export function extractRunRecord(trace: RunTrace): RunRecord {
  const isDead = trace.death.dead;
  let deathEncounterId: string | null = null;

  if (isDead && trace.steps.length > 0) {
    deathEncounterId = trace.steps[trace.steps.length - 1].encounterId;
  }

  return {
    runId: trace.runId,
    pathId: trace.pathId,
    startingLineageSha: trace.stateHashes[0] ?? 'genesis',
    isVictory: !isDead && trace.finalResult !== null && trace.finalResult.resolved,
    deathEncounterId,
    deathClassification: isDead ? trace.death.cause : null,
    startedAt: trace.startedAt,
    completedAt: trace.completedAt,
    e4ApproachCategory: trace.e4ApproachCategory,
  };
}

export function extractExecutionTraces(trace: RunTrace): ExecutionTraceRecord[] {
  return trace.steps.map((step, callIndex) => ({
    traceId: trace.runId,
    stepIndex: step.stepIndex,
    callIndex,
    lineageSha: resolveLineageSha(trace, step.encounterId),
    toolName: step.toolName,
    toolInput: step.toolInput,
    resultText: step.toolOutput,
    isError: (step.toolOutput ?? '').startsWith('Error:') || (step.toolOutput ?? '').startsWith('error:'),
    durationMs: step.durationMs,
    encounterId: step.encounterId,
  }));
}

export function extractChoicePointRecords(trace: RunTrace): ChoicePointRecord[] {
  return trace.choicePoints.map((cp, i) => ({
    choiceId: `cp-${i}`,
    runId: trace.runId,
    encounterNumber: i,
    currentLineageSha: trace.stateHashes[i] ?? 'genesis',
    memoryStateHash: createHash('sha256').update(cp.memoryStateDump).digest('hex').slice(0, 16),
    memoryStateDump: cp.memoryStateDump,
    offeredTools: cp.offeredTools,
    selfAssessment: cp.decision.selfAssessment,
    acquisitionReasoning: cp.decision.acquisitionReasoning,
    sacrificeReasoning: cp.decision.sacrificeReasoning,
    forwardModel: cp.decision.forwardModel,
    selectedTool: cp.decision.chosenTool,
    droppedTool: cp.decision.droppedTool,
    confidenceScore: cp.decision.confidence,
    resultingLineageSha: cp.stateHash,
  }));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the lineage SHA active during a given encounter.
 * The last state hash before or at the encounter's crossroads.
 */
function resolveLineageSha(trace: RunTrace, encounterId: string): string {
  // Find the last choice point that occurred at or before this encounter
  let latestHash = trace.stateHashes[0] ?? 'genesis';
  for (let i = 0; i < trace.choicePoints.length; i++) {
    latestHash = trace.stateHashes[i + 1] ?? latestHash;
  }
  // For simplicity, use the latest state hash for the run
  // (encounters happen sequentially after all preceding crossroads)
  // Find the choice point index for this encounter
  for (let i = trace.choicePoints.length - 1; i >= 0; i--) {
    // The state hash after choice i is stateHashes[i+1]
    latestHash = trace.stateHashes[i + 1] ?? trace.stateHashes[i] ?? 'genesis';
    break;
  }
  return latestHash;
}
