/**
 * Step-level trace writer for tournament encounters.
 *
 * Writes per-agent per-encounter JSONL files with a metadata header
 * followed by one line per step. Atomic append with fsync
 * (same pattern as TournamentWriter).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ExecuteEncounterOutput } from '../encounter-engine';

export type TraceWriter = {
  writeTrace(agentId: string, encounterId: string, output: ExecuteEncounterOutput): void;
};

export type OnEncounterComplete = (
  agentId: string,
  encounterId: string,
  output: ExecuteEncounterOutput,
) => void;

export function createTraceWriter(tournamentDir: string): TraceWriter {
  function writeTrace(agentId: string, encounterId: string, output: ExecuteEncounterOutput): void {
    const dir = path.join(tournamentDir, 'traces', agentId);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${encounterId}.jsonl`);
    const lines: string[] = [];

    // Header with encounter metadata
    lines.push(JSON.stringify({
      type: 'encounter_meta',
      agentId,
      encounterId,
      resolved: output.encounterResult.resolved,
      score: output.encounterResult.score,
      details: output.encounterResult.details,
      response: output.response,
      stepCount: output.steps.length,
      died: output.death.dead,
      deathCause: output.death.cause,
      deathDetails: output.death.details,
    }));

    // One line per step
    for (const step of output.steps) {
      lines.push(JSON.stringify({
        type: 'step',
        ...step,
      }));
    }

    const content = lines.join('\n') + '\n';
    const fd = fs.openSync(filePath, 'w');
    try {
      fs.writeSync(fd, content);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  return { writeTrace };
}
