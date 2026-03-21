#!/usr/bin/env tsx
/**
 * Arena experiment visualizer.
 *
 * Usage:
 *   npm run arena:viz <experiment-id>           — full report from stored traces
 *   npm run arena:viz <experiment-id> --run <id> — single run crossroads tree
 *   npm run arena:viz --live                     — run 1-trial smoke and visualize
 */

import * as path from 'node:path';
import { createArenaTraceWriter } from '../src/arena/trace-writer';
import { formatExperimentReport, formatCrossroadsTree } from '../src/arena/viz';
import type { RunTrace } from '../src/arena/types';

const args = process.argv.slice(2);

const DEFAULT_BASE_PATH = path.resolve(import.meta.dirname, '../data/arena');

async function main() {
  if (args.includes('--help') || args.length === 0) {
    console.log('Usage:');
    console.log('  npm run arena:viz <experiment-id>             Full report');
    console.log('  npm run arena:viz <experiment-id> --run <id>  Single run detail');
    console.log('  npm run arena:viz <experiment-id> --runs      List all run IDs');
    process.exit(0);
  }

  const experimentId = args[0];
  const writer = createArenaTraceWriter({ basePath: DEFAULT_BASE_PATH });

  if (args.includes('--runs')) {
    const runIds = writer.listRuns(experimentId);
    if (runIds.length === 0) {
      console.log(`No runs found for experiment "${experimentId}".`);
      console.log(`Looked in: ${path.join(DEFAULT_BASE_PATH, experimentId)}`);
      process.exit(1);
    }
    console.log(`Runs in ${experimentId} (${runIds.length}):`);
    for (const id of runIds) {
      console.log(`  ${id}`);
    }
    process.exit(0);
  }

  const runIdIdx = args.indexOf('--run');
  if (runIdIdx >= 0) {
    const runId = args[runIdIdx + 1];
    if (!runId) {
      console.error('Missing run ID after --run');
      process.exit(1);
    }
    const events = writer.readRun(experimentId, runId);
    if (events.length === 0) {
      console.error(`Run "${runId}" not found in experiment "${experimentId}".`);
      process.exit(1);
    }
    // Reconstruct trace from events for crossroads display
    const trace = reconstructTrace(events);
    console.log(formatCrossroadsTree(trace));
    process.exit(0);
  }

  // Full report: read all runs
  const runIds = writer.listRuns(experimentId);
  if (runIds.length === 0) {
    console.log(`No runs found for experiment "${experimentId}".`);
    console.log(`Looked in: ${path.join(DEFAULT_BASE_PATH, experimentId)}`);
    process.exit(1);
  }

  const traces: RunTrace[] = [];
  for (const runId of runIds) {
    const events = writer.readRun(experimentId, runId);
    if (events.length > 0) {
      traces.push(reconstructTrace(events));
    }
  }

  console.log(formatExperimentReport(traces));
}

/**
 * Reconstruct a RunTrace from stored JSONL events.
 */
function reconstructTrace(events: Array<Record<string, unknown>>): RunTrace {
  const header = events.find(e => e.type === 'run:header') as Record<string, unknown> | undefined;
  const completion = events.find(e => e.type === 'run:complete') as Record<string, unknown> | undefined;
  const death = events.find(e => e.type === 'run:death') as Record<string, unknown> | undefined;
  const cpEvents = events.filter(e => e.type === 'choice:point');
  const stepEvents = events.filter(e => e.type === 'encounter:step');

  return {
    runId: (header?.runId as string) ?? 'unknown',
    pathId: (header?.pathId as string) ?? 'unknown',
    startedAt: (header?.startedAt as string) ?? '',
    completedAt: (completion?.completedAt as string) ?? (death?.completedAt as string) ?? '',
    steps: stepEvents.map(s => ({
      encounterId: s.encounterId as string,
      stepIndex: s.stepIndex as number,
      toolName: s.toolName as string,
      toolInput: (s.toolInput as Record<string, unknown>) ?? {},
      toolOutput: (s.toolOutput as string) ?? '',
      durationMs: (s.durationMs as number) ?? 0,
    })),
    choicePoints: cpEvents.map(cp => ({
      encounterId: (cp.encounterId as string) ?? '',
      offeredTools: (cp.offeredTools as string[]) ?? [],
      currentTools: (cp.currentTools as string[]) ?? [],
      decision: {
        selfAssessment: (cp.selfAssessment as string) ?? '',
        acquisitionReasoning: (cp.acquisitionReasoning as string) ?? '',
        sacrificeReasoning: (cp.sacrificeReasoning as string | null) ?? null,
        forwardModel: (cp.forwardModel as string) ?? '',
        chosenTool: cp.selectedTool as any,
        droppedTool: (cp.droppedTool as any) ?? null,
        confidence: (cp.confidenceScore as number) ?? 0.5,
      },
      memoryStateDump: (cp.memoryStateDump as string) ?? '',
      stateHash: (cp.stateHash as string) ?? '',
      chainHash: (cp.chainHash as string) ?? '',
    })),
    finalResult: completion ? {
      resolved: (completion.isVictory as boolean) ?? false,
      partial: false,
      score: (completion.finalScore as number) ?? 0,
      details: '',
    } : null,
    death: death ? {
      dead: true,
      cause: (death.cause as any) ?? null,
      details: (death.details as string) ?? null,
    } : { dead: false, cause: null, details: null },
    e4ApproachCategory: (completion?.e4ApproachCategory as any) ?? null,
    stateHashes: [
      (header?.startingStateHash as string) ?? 'genesis',
      ...cpEvents.map(cp => cp.stateHash as string),
    ],
    chainHashes: [
      'genesis',
      ...cpEvents.map(cp => cp.chainHash as string),
    ],
  };
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
