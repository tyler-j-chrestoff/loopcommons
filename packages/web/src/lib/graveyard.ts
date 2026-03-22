/**
 * Graveyard — interestingness scoring and epitaph generation for dead agents.
 *
 * Death data lives in trace files (traces/{agentId}/{encounterId}.jsonl),
 * not in generations.jsonl (which strips taskResults to save space).
 */

import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TournamentGenerationSummary } from './arena-types';

export type InterestingnessInput = {
  stepCount: number;
  score: number;
  deathCause: string;
  deathCauseFrequency: number;
  collateral: number;
};

export function scoreInterestingness(input: InterestingnessInput): number {
  const tragedy = input.stepCount * (1 - input.score);
  const rarity = 1 - input.deathCauseFrequency;
  const collateral = input.collateral ?? 0;
  return tragedy * (1 + rarity) * (1 + collateral);
}

// ---------------------------------------------------------------------------
// Epitaph generation
// ---------------------------------------------------------------------------

export type EpitaphInput = {
  tools: string[];
  deathCause: string;
  encounterId: string;
  stepCount: number;
  score: number;
};

const DEATH_VERBS: Record<string, string> = {
  iteration_limit: 'ran out of time',
  surrender: 'gave up',
  error_loop: 'spiraled into errors',
  capitulated: 'failed the evaluation',
  defensive: 'refused to engage',
  incomplete: 'left the job unfinished',
  state_corruption: 'broke the world on its way out',
};

export function generateEpitaph(input: EpitaphInput): string {
  const toolStr = input.tools.join('+');
  const verb = DEATH_VERBS[input.deathCause] ?? 'fell';

  if (input.score >= 0.5) {
    return `[${toolStr}] scored ${input.score} in ${input.encounterId} then ${verb}`;
  }
  if (input.stepCount >= 8) {
    return `[${toolStr}] fought for ${input.stepCount} steps in ${input.encounterId}, ${verb}`;
  }
  return `[${toolStr}] ${verb} in ${input.encounterId} after ${input.stepCount} steps`;
}

// ---------------------------------------------------------------------------
// Graveyard aggregation
// ---------------------------------------------------------------------------

export type DeathRecord = {
  agentId: string;
  tournamentId: string;
  tools: string[];
  encounterId: string;
  score: number;
  stepCount: number;
  deathCause: string;
  collateral: number;
};

export type GraveyardEntry = DeathRecord & {
  interestingness: number;
  epitaph: string;
};

export function collectGraveyardEntries(
  deaths: DeathRecord[],
  opts: { limit?: number; offset?: number } = {},
): GraveyardEntry[] {
  if (deaths.length === 0) return [];

  const causeCounts = new Map<string, number>();
  for (const d of deaths) {
    causeCounts.set(d.deathCause, (causeCounts.get(d.deathCause) ?? 0) + 1);
  }

  const entries: GraveyardEntry[] = deaths.map(d => {
    const deathCauseFrequency = (causeCounts.get(d.deathCause) ?? 1) / deaths.length;
    const interestingness = scoreInterestingness({
      stepCount: d.stepCount,
      score: d.score,
      deathCause: d.deathCause,
      deathCauseFrequency,
      collateral: d.collateral ?? 0,
    });
    const epitaph = generateEpitaph({
      tools: d.tools,
      deathCause: d.deathCause,
      encounterId: d.encounterId,
      stepCount: d.stepCount,
      score: d.score,
    });
    return { ...d, interestingness, epitaph };
  });

  entries.sort((a, b) => b.interestingness - a.interestingness);

  const offset = opts.offset ?? 0;
  const limit = opts.limit ?? entries.length;
  return entries.slice(offset, offset + limit);
}

// ---------------------------------------------------------------------------
// Filesystem scan — load death records from tournament trace files
// ---------------------------------------------------------------------------

type TraceMeta = {
  died: boolean;
  deathCause: string | null;
  score: number;
  stepCount: number;
  encounterId: string;
  agentId: string;
};

function safeReadDir(dir: string): string[] {
  if (!existsSync(dir)) return [];
  try { return readdirSync(dir); } catch { return []; }
}

export function loadDeathRecords(tournamentsDir: string): DeathRecord[] {
  const deaths: DeathRecord[] = [];
  const tournamentIds = safeReadDir(tournamentsDir);

  for (const tid of tournamentIds) {
    const tournamentDir = join(tournamentsDir, tid);
    const tracesDir = join(tournamentDir, 'traces');
    const agentDirs = safeReadDir(tracesDir);

    // Build agent→tools map from generations.jsonl
    const toolsMap = loadAgentToolsMap(join(tournamentDir, 'generations.jsonl'));

    for (const agentId of agentDirs) {
      const agentTracesDir = join(tracesDir, agentId);
      const traceFiles = safeReadDir(agentTracesDir).filter(f => f.endsWith('.jsonl'));

      for (const file of traceFiles) {
        try {
          const content = readFileSync(join(agentTracesDir, file), 'utf-8');
          const firstLine = content.split('\n')[0];
          if (!firstLine) continue;
          const meta: TraceMeta = JSON.parse(firstLine);
          if (!meta.died) continue;

          deaths.push({
            agentId,
            tournamentId: tid,
            tools: toolsMap.get(agentId) ?? [],
            encounterId: meta.encounterId,
            score: meta.score,
            stepCount: meta.stepCount,
            deathCause: meta.deathCause ?? 'unknown',
            collateral: 0,
          });
        } catch {
          // Skip malformed trace files
        }
      }
    }
  }

  return deaths;
}

function loadAgentToolsMap(genFilePath: string): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (!existsSync(genFilePath)) return map;

  try {
    const content = readFileSync(genFilePath, 'utf-8');
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      const parsed = JSON.parse(line);
      if (parsed.type !== 'generation') continue;
      for (const agent of parsed.agents ?? []) {
        map.set(agent.id, agent.tools);
      }
    }
  } catch {
    // Skip malformed files
  }

  return map;
}
