import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTournamentManager,
  type TournamentManager,
} from '../src/lib/tournament-manager';
import type { TournamentEvent, TournamentTrace } from '@loopcommons/llm/arena/tournament';

function makeFitness(agentId: string, score: number) {
  return {
    agentId,
    taskResults: [],
    fitnessScore: score,
    metrics: {
      completionRate: score,
      meanScore: score,
      meanSteps: 3,
      survivalRate: 1,
      totalCost: 0.001,
      meanCollateral: 0,
    },
  };
}

function makeAgent(id: string, tools: string[]) {
  return {
    id,
    tools: tools as any,
    memoryState: '[]',
    identity: { commitSha: 'c', toolCompositionHash: 'h', derivedPromptHash: 'h' },
    generation: 0,
    origin: 'seed' as const,
    parentIds: [],
  };
}

describe('TournamentManager', () => {
  let mgr: TournamentManager;

  beforeEach(() => {
    mgr = createTournamentManager();
  });

  it('starts in idle state', () => {
    expect(mgr.getStatus()).toBe('idle');
    expect(mgr.getTournamentId()).toBeNull();
  });

  it('transitions to running on start', () => {
    mgr.start('t-1');
    expect(mgr.getStatus()).toBe('running');
    expect(mgr.getTournamentId()).toBe('t-1');
  });

  it('rejects concurrent tournaments', () => {
    mgr.start('t-1');
    expect(() => mgr.start('t-2')).toThrow('Tournament already running');
  });

  it('tracks generation from generation:start events', () => {
    mgr.start('t-1');
    mgr.handleEvent({ type: 'generation:start', generation: 2 });
    expect(mgr.getSnapshot().generation).toBe(2);
  });

  it('tracks fitness from evaluation:complete events', () => {
    mgr.start('t-1');
    const fitness = makeFitness('a1', 0.75);
    mgr.handleEvent({ type: 'evaluation:complete', generation: 0, agentId: 'a1', fitness });
    const snap = mgr.getSnapshot();
    expect(snap.fitness).toHaveLength(1);
    expect(snap.fitness[0].fitnessScore).toBe(0.75);
    expect(snap.bestFitness).toBe(0.75);
  });

  it('updates population from generation:complete events', () => {
    mgr.start('t-1');
    const agent = makeAgent('a1', ['inspect', 'act']);
    const fitness = makeFitness('a1', 0.8);
    mgr.handleEvent({
      type: 'generation:complete',
      result: {
        generation: 0,
        population: [agent],
        fitness: [fitness],
        survivors: ['a1'],
        mutations: [],
        crossovers: [],
        lineage: [],
        durationMs: 100,
      },
    });
    const snap = mgr.getSnapshot();
    expect(snap.population).toHaveLength(1);
    expect(snap.population[0].tools).toEqual(['inspect', 'act']);
  });

  it('completes with winner from tournament:complete', () => {
    mgr.start('t-1');
    const winner = makeAgent('w1', ['act', 'search']);
    const trace: TournamentTrace = {
      tournamentId: 't-1',
      config: {} as any,
      generations: [],
      startedAt: '2026-01-01',
      completedAt: '2026-01-01',
      winner,
      bestFitness: 0.9,
    };
    mgr.handleEvent({ type: 'tournament:complete', trace });
    mgr.complete(trace);
    expect(mgr.getStatus()).toBe('complete');
    expect(mgr.getSnapshot().bestAgent).toEqual({ id: 'w1', tools: ['act', 'search'] });
    expect(mgr.getSnapshot().bestFitness).toBe(0.9);
  });

  it('broadcasts events to subscribers', () => {
    mgr.start('t-1');
    const events: TournamentEvent[] = [];
    mgr.subscribe((e) => events.push(e));
    mgr.handleEvent({ type: 'generation:start', generation: 0 });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('generation:start');
  });

  it('unsubscribe stops delivery', () => {
    mgr.start('t-1');
    const events: TournamentEvent[] = [];
    const unsub = mgr.subscribe((e) => events.push(e));
    unsub();
    mgr.handleEvent({ type: 'generation:start', generation: 0 });
    expect(events).toHaveLength(0);
  });

  it('handles subscriber errors gracefully', () => {
    mgr.start('t-1');
    mgr.subscribe(() => { throw new Error('boom'); });
    const events: TournamentEvent[] = [];
    mgr.subscribe((e) => events.push(e));
    mgr.handleEvent({ type: 'generation:start', generation: 0 });
    expect(events).toHaveLength(1);
  });

  it('fail sets error state', () => {
    mgr.start('t-1');
    mgr.fail('LLM rate limit');
    expect(mgr.getStatus()).toBe('error');
    expect(mgr.getSnapshot().error).toBe('LLM rate limit');
  });

  it('reset returns to idle', () => {
    mgr.start('t-1');
    mgr.handleEvent({ type: 'generation:start', generation: 5 });
    mgr.reset();
    expect(mgr.getStatus()).toBe('idle');
    expect(mgr.getSnapshot().generation).toBe(0);
    expect(mgr.getTournamentId()).toBeNull();
  });

  it('snapshot contains startedAt', () => {
    mgr.start('t-1');
    expect(mgr.getSnapshot().startedAt).toBeTruthy();
  });

  it('replaces fitness for same agent on re-evaluation', () => {
    mgr.start('t-1');
    mgr.handleEvent({ type: 'evaluation:complete', generation: 0, agentId: 'a1', fitness: makeFitness('a1', 0.5) });
    mgr.handleEvent({ type: 'evaluation:complete', generation: 0, agentId: 'a1', fitness: makeFitness('a1', 0.9) });
    expect(mgr.getSnapshot().fitness).toHaveLength(1);
    expect(mgr.getSnapshot().fitness[0].fitnessScore).toBe(0.9);
  });
});
