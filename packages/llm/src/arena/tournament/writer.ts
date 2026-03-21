/**
 * JSONL writer for tournament generation logs.
 *
 * Atomic append with fsync (same pattern as calibration logger and trace writer).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GenerationResult, TournamentTrace, TournamentEvent } from './types';

export type TournamentWriter = {
  writeGeneration(result: GenerationResult): void;
  writeTournamentComplete(trace: TournamentTrace): void;
  createEventSink(): (event: TournamentEvent) => void;
};

export function createTournamentWriter(outputDir: string): TournamentWriter {
  fs.mkdirSync(outputDir, { recursive: true });

  function appendJsonl(filename: string, record: unknown): void {
    const filePath = path.join(outputDir, filename);
    const line = JSON.stringify(record) + '\n';
    const fd = fs.openSync(filePath, 'a');
    try {
      fs.writeSync(fd, line);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
  }

  function writeGeneration(result: GenerationResult): void {
    // Write per-generation summary (strip full population to save space)
    const summary = {
      type: 'generation',
      generation: result.generation,
      populationSize: result.population.length,
      agents: result.population.map(a => ({
        id: a.id,
        tools: a.tools,
        origin: a.origin,
        parentIds: a.parentIds,
        identity: a.identity.toolCompositionHash,
      })),
      fitness: result.fitness.map(f => ({
        agentId: f.agentId,
        fitnessScore: f.fitnessScore,
        metrics: f.metrics,
      })),
      survivors: result.survivors,
      mutations: result.mutations,
      crossovers: result.crossovers,
      durationMs: result.durationMs,
    };
    appendJsonl('generations.jsonl', summary);
  }

  function writeTournamentComplete(trace: TournamentTrace): void {
    const summary = {
      type: 'tournament_complete',
      tournamentId: trace.tournamentId,
      generationsRun: trace.generations.length,
      bestFitness: trace.bestFitness,
      winnerId: trace.winner?.id ?? null,
      winnerTools: trace.winner?.tools ?? null,
      winnerOrigin: trace.winner?.origin ?? null,
      startedAt: trace.startedAt,
      completedAt: trace.completedAt,
    };
    appendJsonl('generations.jsonl', summary);
  }

  function createEventSink(): (event: TournamentEvent) => void {
    return (event: TournamentEvent) => {
      appendJsonl('events.jsonl', { ...event, timestamp: new Date().toISOString() });
    };
  }

  return { writeGeneration, writeTournamentComplete, createEventSink };
}
