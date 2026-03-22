/**
 * Tournament manager — server-side singleton for live tournament streaming.
 *
 * Holds the active tournament state, manages SSE subscriber pub/sub,
 * and enforces one-tournament-at-a-time concurrency.
 */

import type {
  TournamentConfig,
  TournamentEvent,
  TournamentTrace,
  AgentFitness,
  GenerationResult,
} from '@loopcommons/llm/arena/tournament';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TournamentStatus = 'idle' | 'running' | 'complete' | 'error';

export type TaskResultSummary = {
  encounterId: string;
  resolved: boolean;
  score: number;
};

export type TournamentSnapshot = {
  tournamentId: string | null;
  status: TournamentStatus;
  generation: number;
  population: Array<{ id: string; tools: string[] }>;
  fitness: Array<{ agentId: string; fitnessScore: number; taskResults: TaskResultSummary[] }>;
  bestFitness: number;
  bestAgent: { id: string; tools: string[] } | null;
  startedAt: string | null;
  error: string | null;
};

type Subscriber = (event: TournamentEvent) => void;

// ---------------------------------------------------------------------------
// Manager
// ---------------------------------------------------------------------------

export type TournamentManager = {
  getStatus: () => TournamentStatus;
  getSnapshot: () => TournamentSnapshot;
  getTournamentId: () => string | null;
  subscribe: (fn: Subscriber) => () => void;
  handleEvent: (event: TournamentEvent) => void;
  start: (tournamentId: string) => void;
  complete: (trace: TournamentTrace) => void;
  fail: (error: string) => void;
  reset: () => void;
};

export function createTournamentManager(): TournamentManager {
  let status: TournamentStatus = 'idle';
  let tournamentId: string | null = null;
  let generation = 0;
  let population: Array<{ id: string; tools: string[] }> = [];
  let fitness: Array<{ agentId: string; fitnessScore: number; taskResults: TaskResultSummary[] }> = [];
  let bestFitness = 0;
  let bestAgent: { id: string; tools: string[] } | null = null;
  let startedAt: string | null = null;
  let errorMsg: string | null = null;
  const subscribers = new Set<Subscriber>();

  function broadcast(event: TournamentEvent) {
    for (const fn of subscribers) {
      try { fn(event); } catch { /* client disconnected */ }
    }
  }

  function handleEvent(event: TournamentEvent) {
    switch (event.type) {
      case 'generation:start':
        generation = event.generation;
        break;
      case 'evaluation:complete':
        fitness = fitness.filter(f => f.agentId !== event.agentId);
        fitness.push({
          agentId: event.agentId,
          fitnessScore: event.fitness.fitnessScore,
          taskResults: event.fitness.taskResults.map(tr => ({
            encounterId: tr.encounterId,
            resolved: tr.resolved,
            score: tr.score,
          })),
        });
        if (event.fitness.fitnessScore > bestFitness) {
          bestFitness = event.fitness.fitnessScore;
        }
        break;
      case 'generation:complete': {
        const r = event.result;
        population = r.population.map(a => ({ id: a.id, tools: [...a.tools] }));
        fitness = r.fitness.map(f => ({
          agentId: f.agentId,
          fitnessScore: f.fitnessScore,
          taskResults: f.taskResults.map(tr => ({
            encounterId: tr.encounterId,
            resolved: tr.resolved,
            score: tr.score,
          })),
        }));
        break;
      }
      case 'tournament:complete': {
        const w = event.trace.winner;
        if (w) bestAgent = { id: w.id, tools: [...w.tools] };
        bestFitness = event.trace.bestFitness;
        break;
      }
    }
    broadcast(event);
  }

  function start(id: string) {
    if (status === 'running') throw new Error('Tournament already running');
    status = 'running';
    tournamentId = id;
    generation = 0;
    population = [];
    fitness = [];
    bestFitness = 0;
    bestAgent = null;
    startedAt = new Date().toISOString();
    errorMsg = null;
  }

  function complete(trace: TournamentTrace) {
    status = 'complete';
    if (trace.winner) bestAgent = { id: trace.winner.id, tools: [...trace.winner.tools] };
    bestFitness = trace.bestFitness;
  }

  function fail(error: string) {
    status = 'error';
    errorMsg = error;
  }

  function reset() {
    status = 'idle';
    tournamentId = null;
    generation = 0;
    population = [];
    fitness = [];
    bestFitness = 0;
    bestAgent = null;
    startedAt = null;
    errorMsg = null;
  }

  return {
    getStatus: () => status,
    getTournamentId: () => tournamentId,
    getSnapshot: () => ({
      tournamentId,
      status,
      generation,
      population: [...population],
      fitness: [...fitness],
      bestFitness,
      bestAgent,
      startedAt,
      error: errorMsg,
    }),
    subscribe: (fn) => {
      subscribers.add(fn);
      return () => { subscribers.delete(fn); };
    },
    handleEvent,
    start,
    complete,
    fail,
    reset,
  };
}

// ---------------------------------------------------------------------------
// Disk rehydration — load most recent tournament on cold start
// ---------------------------------------------------------------------------

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const TOURNAMENTS_DIR = resolve(
  process.env.SESSION_DATA_DIR ?? process.cwd(),
  'data/arena/tournaments',
);

function rehydrateFromDisk(manager: TournamentManager): void {
  try {
    if (!existsSync(TOURNAMENTS_DIR)) return;

    // Find most recent tournament directory by mtime
    const dirs = readdirSync(TOURNAMENTS_DIR)
      .map(d => ({ name: d, path: join(TOURNAMENTS_DIR, d) }))
      .filter(d => {
        try { return statSync(d.path).isDirectory(); } catch { return false; }
      })
      .sort((a, b) => {
        try {
          return statSync(b.path).mtimeMs - statSync(a.path).mtimeMs;
        } catch { return 0; }
      });

    if (dirs.length === 0) return;

    const latest = dirs[0];
    const genFile = join(latest.path, 'generations.jsonl');
    if (!existsSync(genFile)) return;

    const lines = readFileSync(genFile, 'utf-8')
      .split('\n')
      .filter(l => l.trim().length > 0)
      .map(l => JSON.parse(l));

    if (lines.length === 0) return;

    // Reconstruct state from persisted data
    const tournamentId = latest.name;
    const isComplete = lines.some((l: any) => l.type === 'tournament_complete');

    manager.start(tournamentId);

    for (const line of lines) {
      if (line.type === 'generation') {
        // Rebuild generation:complete-like state from persisted summary
        const pop = (line.agents ?? []).map((a: any) => ({ id: a.id, tools: a.tools }));
        const fit = (line.fitness ?? []).map((f: any) => ({
          agentId: f.agentId,
          fitnessScore: f.fitnessScore,
          taskResults: (f.taskResults ?? []).map((tr: any) => ({
            encounterId: tr.encounterId,
            resolved: tr.resolved,
            score: tr.score,
          })),
        }));

        // Manually set population/fitness/generation via a synthetic event
        manager.handleEvent({
          type: 'generation:complete',
          result: {
            generation: line.generation,
            population: pop.map((a: any) => ({
              ...a,
              memoryState: '[]',
              identity: { commitSha: '', toolCompositionHash: '', derivedPromptHash: '' },
              generation: line.generation,
              origin: 'seed' as const,
              parentIds: [],
            })),
            fitness: fit.map((f: any) => ({
              ...f,
              taskResults: f.taskResults.map((tr: any) => ({
                ...tr,
                stepCount: 0,
                died: false,
                costEstimate: 0,
              })),
              metrics: line.fitness?.find((lf: any) => lf.agentId === f.agentId)?.metrics ?? {
                completionRate: 0,
                meanScore: 0,
                meanSteps: 0,
                survivalRate: 0,
                totalCost: 0,
                meanCollateral: 0,
              },
            })),
            survivors: line.survivors ?? [],
            mutations: line.mutations ?? [],
            crossovers: line.crossovers ?? [],
            lineage: [],
            durationMs: line.durationMs ?? 0,
          },
        } as any);
      }

      if (line.type === 'tournament_complete') {
        const winner = line.winnerTools
          ? { id: line.winnerId ?? '', tools: line.winnerTools }
          : null;
        manager.complete({
          tournamentId,
          config: {} as any,
          generations: [],
          startedAt: line.startedAt ?? '',
          completedAt: line.completedAt ?? '',
          winner: winner ? {
            ...winner,
            memoryState: '[]',
            identity: { commitSha: '', toolCompositionHash: '', derivedPromptHash: '' },
            generation: 0,
            origin: 'seed' as const,
            parentIds: [],
          } : null,
          bestFitness: line.bestFitness ?? 0,
        });
      }
    }

    // If no tournament_complete line, it was interrupted — mark as error
    if (!isComplete) {
      manager.fail('Tournament was interrupted (server restart). Data preserved on disk.');
    }
  } catch {
    // Rehydration failure is non-fatal — start fresh
  }
}

// ---------------------------------------------------------------------------
// Singleton — shared across API routes within the same process
// ---------------------------------------------------------------------------

let _manager: TournamentManager | null = null;

export function getTournamentManager(): TournamentManager {
  if (!_manager) {
    _manager = createTournamentManager();
    rehydrateFromDisk(_manager);
  }
  return _manager;
}

export function resetTournamentManager(): void {
  _manager = null;
}
