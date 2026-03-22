/**
 * Tournament data loader — reads persisted tournament data from disk.
 *
 * Reads from data/arena/tournaments/{id}/ directories containing
 * generations.jsonl, events.jsonl, and traces/{agentId}/{encounterId}.jsonl.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type {
  TournamentGenerationSummary,
  TournamentCompleteSummary,
  TournamentData,
} from './arena-types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TournamentSummary = {
  id: string;
  status: 'complete' | 'interrupted';
  generationCount: number;
  agentCount: number;
  bestFitness: number;
  winnerId: string | null;
  winnerTools: string[] | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type TournamentDetail = TournamentData & {
  id: string;
};

export type EncounterTraceMeta = {
  encounterId: string;
  agentId: string;
  resolved: boolean;
  score: number;
  details: string;
  response: string;
  stepCount: number;
  died: boolean;
  deathCause: string | null;
  deathDetails: string | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseGenerationsFile(filePath: string): TournamentData {
  if (!existsSync(filePath)) {
    return { generations: [], complete: null };
  }

  const content = readFileSync(filePath, 'utf-8');
  const lines = content
    .split('\n')
    .filter(l => l.trim().length > 0)
    .map(l => JSON.parse(l));

  const generations: TournamentGenerationSummary[] = [];
  let complete: TournamentCompleteSummary | null = null;

  for (const line of lines) {
    if (line.type === 'generation') {
      generations.push(line as TournamentGenerationSummary);
    } else if (line.type === 'tournament_complete') {
      complete = line as TournamentCompleteSummary;
    }
  }

  return { generations, complete };
}

function getTournamentDirs(tournamentsDir: string): Array<{ name: string; path: string; mtimeMs: number }> {
  if (!existsSync(tournamentsDir)) return [];

  return readdirSync(tournamentsDir)
    .map(name => {
      const dirPath = join(tournamentsDir, name);
      try {
        const stat = statSync(dirPath);
        if (!stat.isDirectory()) return null;
        return { name, path: dirPath, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((d): d is NonNullable<typeof d> => d !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function listTournaments(tournamentsDir: string): TournamentSummary[] {
  const dirs = getTournamentDirs(tournamentsDir);

  return dirs.map(dir => {
    const genFile = join(dir.path, 'generations.jsonl');
    const data = parseGenerationsFile(genFile);

    const lastGen = data.generations[data.generations.length - 1];
    const agentCount = lastGen?.populationSize ?? 0;

    return {
      id: dir.name,
      status: data.complete ? 'complete' as const : 'interrupted' as const,
      generationCount: data.generations.length,
      agentCount,
      bestFitness: data.complete?.bestFitness ?? Math.max(0, ...data.generations.flatMap(g => g.fitness.map(f => f.fitnessScore))),
      winnerId: data.complete?.winnerId ?? null,
      winnerTools: data.complete?.winnerTools ?? null,
      startedAt: data.complete?.startedAt ?? null,
      completedAt: data.complete?.completedAt ?? null,
    };
  });
}

export function loadTournamentDetail(tournamentsDir: string, tournamentId: string): TournamentDetail | null {
  const dirPath = join(tournamentsDir, tournamentId);
  const genFile = join(dirPath, 'generations.jsonl');
  if (!existsSync(genFile)) return null;

  const data = parseGenerationsFile(genFile);
  return { id: tournamentId, ...data };
}

export type EncounterTraceStep = {
  encounterId: string;
  stepIndex: number;
  toolName: string;
  toolInput: Record<string, unknown>;
  toolOutput: string;
  durationMs: number;
};

export type EncounterTraceData = {
  meta: EncounterTraceMeta;
  steps: EncounterTraceStep[];
};

export function loadEncounterTrace(
  tournamentsDir: string,
  tournamentId: string,
  agentId: string,
  encounterId: string,
): EncounterTraceData | null {
  const filePath = join(tournamentsDir, tournamentId, 'traces', agentId, `${encounterId}.jsonl`);
  if (!existsSync(filePath)) return null;

  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return null;

  const meta = JSON.parse(lines[0]) as EncounterTraceMeta;
  const steps: EncounterTraceStep[] = lines
    .slice(1)
    .map(l => JSON.parse(l))
    .filter((e): e is EncounterTraceStep => e.type === 'step');

  return { meta, steps };
}

export function loadEncounterTraces(tournamentsDir: string, tournamentId: string, agentId: string): EncounterTraceMeta[] {
  const tracesDir = join(tournamentsDir, tournamentId, 'traces', agentId);
  if (!existsSync(tracesDir)) return [];

  const files = readdirSync(tracesDir).filter(f => f.endsWith('.jsonl'));
  return files.map(file => {
    const content = readFileSync(join(tracesDir, file), 'utf-8');
    const firstLine = content.split('\n')[0];
    return JSON.parse(firstLine) as EncounterTraceMeta;
  });
}
