import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createTournamentWriter } from '../../../src/arena/tournament/writer';
import type { GenerationResult, TournamentTrace } from '../../../src/arena/tournament/types';

describe('tournament writer', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tournament-writer-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes generation JSONL', () => {
    const writer = createTournamentWriter(tmpDir);
    const gen: GenerationResult = {
      generation: 0,
      population: [{
        id: 'a1',
        tools: ['inspect', 'act'],
        memoryState: '[]',
        identity: { commitSha: 'abc', toolCompositionHash: 'hash1', derivedPromptHash: 'hash1' },
        generation: 0,
        origin: 'seed',
        parentIds: [],
      }],
      fitness: [{
        agentId: 'a1',
        taskResults: [],
        fitnessScore: 0.75,
        metrics: { completionRate: 1, meanScore: 0.8, meanSteps: 3, survivalRate: 1, totalCost: 0.001 },
      }],
      survivors: ['a1'],
      mutations: [],
      crossovers: [],
      lineage: [],
      durationMs: 100,
    };

    writer.writeGeneration(gen);

    const content = fs.readFileSync(path.join(tmpDir, 'generations.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').map(l => JSON.parse(l));
    expect(lines.length).toBe(1);
    expect(lines[0].type).toBe('generation');
    expect(lines[0].generation).toBe(0);
    expect(lines[0].fitness[0].fitnessScore).toBe(0.75);
  });

  it('writes tournament complete summary', () => {
    const writer = createTournamentWriter(tmpDir);
    const trace: TournamentTrace = {
      tournamentId: 'test-tournament',
      config: {} as any,
      generations: [],
      startedAt: '2026-01-01T00:00:00Z',
      completedAt: '2026-01-01T01:00:00Z',
      winner: {
        id: 'winner-1',
        tools: ['inspect', 'act', 'search'],
        memoryState: '[]',
        identity: { commitSha: 'abc', toolCompositionHash: 'hash', derivedPromptHash: 'hash' },
        generation: 10,
        origin: 'mutation',
        parentIds: ['parent-1'],
      },
      bestFitness: 0.92,
    };

    writer.writeTournamentComplete(trace);

    const content = fs.readFileSync(path.join(tmpDir, 'generations.jsonl'), 'utf-8');
    const record = JSON.parse(content.trim());
    expect(record.type).toBe('tournament_complete');
    expect(record.bestFitness).toBe(0.92);
    expect(record.winnerTools).toEqual(['inspect', 'act', 'search']);
  });

  it('event sink writes all events to events.jsonl', () => {
    const writer = createTournamentWriter(tmpDir);
    const sink = writer.createEventSink();

    sink({ type: 'tournament:start', config: {} as any });
    sink({ type: 'generation:start', generation: 0 });

    const content = fs.readFileSync(path.join(tmpDir, 'events.jsonl'), 'utf-8');
    const lines = content.trim().split('\n').map(l => JSON.parse(l));
    expect(lines.length).toBe(2);
    expect(lines[0].type).toBe('tournament:start');
    expect(lines[1].type).toBe('generation:start');
    expect(lines[0].timestamp).toBeDefined();
  });
});
