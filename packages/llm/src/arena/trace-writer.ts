/**
 * ArenaTraceWriter — JSONL persistence for arena run traces.
 *
 * Each run is written as a single JSONL file:
 *   {basePath}/{experimentId}/{runId}.jsonl
 *
 * Events per file: run:header, choice:point*, encounter:step*, run:complete|run:death.
 * Atomic append with fsync for durability.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { RunTrace } from './types';

// ---------------------------------------------------------------------------
// Event types written to JSONL
// ---------------------------------------------------------------------------

export type TraceEvent =
  | RunHeaderEvent
  | EncounterStartEvent
  | ChoicePointEvent
  | EncounterStepEvent
  | AgentResponseEvent
  | EncounterResultEvent
  | RunCompleteEvent
  | RunDeathEvent;

type RunHeaderEvent = {
  type: 'run:header';
  runId: string;
  pathId: string;
  startedAt: string;
  startingStateHash: string;
  pathLabel: string;
};

type EncounterStartEvent = {
  type: 'encounter:start';
  encounterId: string;
  encounterName: string;
  prompt: string;
  availableTools: string[];
};

type ChoicePointEvent = {
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

type EncounterStepEvent = {
  type: 'encounter:step';
  encounterId: string;
  stepIndex: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  durationMs: number;
};

type AgentResponseEvent = {
  type: 'agent:response';
  encounterId: string;
  response: string;
};

type EncounterResultEvent = {
  type: 'encounter:result';
  encounterId: string;
  resolved: boolean;
  partial: boolean;
  score: number;
  details: string;
};

type RunCompleteEvent = {
  type: 'run:complete';
  completedAt: string;
  isVictory: boolean;
  finalScore: number | null;
  e4ApproachCategory: string | null;
};

type RunDeathEvent = {
  type: 'run:death';
  completedAt: string;
  cause: string | null;
  details: string | null;
  lastEncounterId: string | null;
};

// ---------------------------------------------------------------------------
// Writer interface
// ---------------------------------------------------------------------------

export type ArenaTraceWriter = {
  writeRun(experimentId: string, trace: RunTrace): void;
  /** Create an event sink for streaming writes during a run. */
  createEventSink(experimentId: string, runId: string): (event: Record<string, unknown>) => void;
  readRun(experimentId: string, runId: string): TraceEvent[];
  listRuns(experimentId: string): string[];
};

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

const DEFAULT_BASE_PATH = 'data/arena';

export function createArenaTraceWriter(options?: { basePath?: string }): ArenaTraceWriter {
  const basePath = options?.basePath ?? DEFAULT_BASE_PATH;

  function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  function appendLine(filePath: string, event: TraceEvent): void {
    const line = JSON.stringify(event) + '\n';
    const fd = fs.openSync(filePath, 'a');
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  return {
    createEventSink(experimentId: string, runId: string): (event: Record<string, unknown>) => void {
      const dir = path.join(basePath, experimentId);
      ensureDir(dir);
      const filePath = path.join(dir, `${runId}.jsonl`);
      return (event: Record<string, unknown>) => {
        appendLine(filePath, event as TraceEvent);
      };
    },

    writeRun(experimentId: string, trace: RunTrace): void {
      const dir = path.join(basePath, experimentId);
      ensureDir(dir);
      const filePath = path.join(dir, `${trace.runId}.jsonl`);

      // Header
      appendLine(filePath, {
        type: 'run:header',
        runId: trace.runId,
        pathId: trace.pathId,
        startedAt: trace.startedAt,
        startingStateHash: trace.stateHashes[0] ?? 'genesis',
      });

      // Choice points
      for (const cp of trace.choicePoints) {
        appendLine(filePath, {
          type: 'choice:point',
          encounterId: cp.encounterId,
          offeredTools: cp.offeredTools,
          currentTools: cp.currentTools,
          selectedTool: cp.decision.chosenTool,
          droppedTool: cp.decision.droppedTool,
          confidenceScore: cp.decision.confidence,
          selfAssessment: cp.decision.selfAssessment,
          acquisitionReasoning: cp.decision.acquisitionReasoning,
          sacrificeReasoning: cp.decision.sacrificeReasoning,
          forwardModel: cp.decision.forwardModel,
          memoryStateDump: cp.memoryStateDump,
          stateHash: cp.stateHash,
          chainHash: cp.chainHash,
        });
      }

      // Steps
      for (const step of trace.steps) {
        appendLine(filePath, {
          type: 'encounter:step',
          encounterId: step.encounterId,
          stepIndex: step.stepIndex,
          toolName: step.toolName,
          toolInput: step.toolInput,
          toolOutput: step.toolOutput,
          durationMs: step.durationMs,
        });
      }

      // Completion or death
      if (trace.death.dead) {
        const lastStep = trace.steps[trace.steps.length - 1];
        appendLine(filePath, {
          type: 'run:death',
          completedAt: trace.completedAt,
          cause: trace.death.cause,
          details: trace.death.details,
          lastEncounterId: lastStep?.encounterId ?? null,
        });
      } else {
        appendLine(filePath, {
          type: 'run:complete',
          completedAt: trace.completedAt,
          isVictory: trace.finalResult !== null && trace.finalResult.resolved,
          finalScore: trace.finalResult?.score ?? null,
          e4ApproachCategory: trace.e4ApproachCategory,
        });
      }
    },

    readRun(experimentId: string, runId: string): TraceEvent[] {
      const filePath = path.join(basePath, experimentId, `${runId}.jsonl`);
      if (!fs.existsSync(filePath)) return [];

      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .filter(l => l.trim().length > 0)
        .map(l => JSON.parse(l) as TraceEvent);
    },

    listRuns(experimentId: string): string[] {
      const dir = path.join(basePath, experimentId);
      if (!fs.existsSync(dir)) return [];

      return fs.readdirSync(dir)
        .filter(f => f.endsWith('.jsonl'))
        .map(f => f.replace(/\.jsonl$/, ''));
    },
  };
}
