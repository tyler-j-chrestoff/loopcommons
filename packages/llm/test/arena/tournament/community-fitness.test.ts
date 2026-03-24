import { describe, it, expect } from 'vitest';
import {
  computeMarginalContribution,
  selectSurvivorsWithNiches,
  computePopulationHealth,
  extractDeadLineages,
} from '../../../src/arena/tournament/community-fitness';
import { computeAgentFitness } from '../../../src/arena/tournament/fitness';
import type { AgentFitness, TaskResult, TournamentAgent, GenerationResult } from '../../../src/arena/tournament/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTaskResult(encounterId: string, resolved: boolean, score = 0.5): TaskResult {
  return {
    encounterId,
    resolved,
    score: resolved ? score : 0,
    stepCount: 3,
    died: !resolved,
    costEstimate: 0.001,
  };
}

function makeFitness(agentId: string, encounters: Array<{ id: string; resolved: boolean; score?: number }>): AgentFitness {
  const tasks = encounters.map(e => makeTaskResult(e.id, e.resolved, e.score));
  return computeAgentFitness(agentId, tasks);
}

function makeAgent(id: string, tools: string[], generation: number, origin: TournamentAgent['origin'] = 'seed'): TournamentAgent {
  return {
    id,
    tools: tools as TournamentAgent['tools'],
    memoryState: '[]',
    identity: { commitSha: 'abc', toolCompositionHash: `hash-${id}`, derivedPromptHash: `hash-${id}` },
    generation,
    origin,
    parentIds: [],
  };
}

// ---------------------------------------------------------------------------
// cf-02: Marginal contribution
// ---------------------------------------------------------------------------

describe('computeMarginalContribution', () => {
  it('agent that uniquely solves an encounter gets marginal contribution 1', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }]),
    ];
    const mc = computeMarginalContribution(fitness);
    // A solves E1 and E2. B solves E1 only. E2 is uniquely solved by A.
    expect(mc.get('A')).toBe(1);
    // B has no unique solves — A also solves E1
    expect(mc.get('B')).toBe(0);
  });

  it('multiple unique solves add up', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }, { id: 'E3', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: true }, { id: 'E3', resolved: true }]),
    ];
    const mc = computeMarginalContribution(fitness);
    expect(mc.get('A')).toBe(1); // uniquely solves E1
    expect(mc.get('B')).toBe(2); // uniquely solves E2, E3
  });

  it('encounter solved by nobody contributes to nobody', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: false }]),
    ];
    const mc = computeMarginalContribution(fitness);
    expect(mc.get('A')).toBe(0);
    expect(mc.get('B')).toBe(0);
  });

  it('encounter solved by multiple agents contributes to none', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: true }]),
      makeFitness('C', [{ id: 'E1', resolved: true }]),
    ];
    const mc = computeMarginalContribution(fitness);
    expect(mc.get('A')).toBe(0);
    expect(mc.get('B')).toBe(0);
    expect(mc.get('C')).toBe(0);
  });

  it('single agent gets marginal contribution for all solved encounters', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: true }, { id: 'E3', resolved: false }]),
    ];
    const mc = computeMarginalContribution(fitness);
    expect(mc.get('A')).toBe(2); // E1 and E2
  });

  it('returns empty map for empty population', () => {
    const mc = computeMarginalContribution([]);
    expect(mc.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cf-03: Niche-preserving selection
// ---------------------------------------------------------------------------

describe('selectSurvivorsWithNiches', () => {
  it('preserves a niche specialist even with low individual fitness', () => {
    // A is a generalist with high fitness, solves E1 and E2
    // B is a specialist with low fitness, uniquely solves E3
    // C is a copy of A (redundant)
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true, score: 0.9 }, { id: 'E2', resolved: true, score: 0.9 }, { id: 'E3', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: false }, { id: 'E3', resolved: true, score: 0.3 }]),
      makeFitness('C', [{ id: 'E1', resolved: true, score: 0.8 }, { id: 'E2', resolved: true, score: 0.8 }, { id: 'E3', resolved: false }]),
    ];
    // Select 2 of 3: niche selection should keep B (unique solver of E3) over C (redundant with A)
    const survivors = selectSurvivorsWithNiches(fitness, 2);
    expect(survivors).toContain('A');
    expect(survivors).toContain('B');
    expect(survivors).not.toContain('C');
  });

  it('falls back to fitness ranking when no niches exist', () => {
    // All agents solve the same encounters — no unique solvers
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true, score: 0.9 }]),
      makeFitness('B', [{ id: 'E1', resolved: true, score: 0.5 }]),
      makeFitness('C', [{ id: 'E1', resolved: true, score: 0.3 }]),
    ];
    const survivors = selectSurvivorsWithNiches(fitness, 2);
    expect(survivors).toContain('A');
    expect(survivors).toContain('B');
    expect(survivors).not.toContain('C');
  });

  it('niche specialists count is capped by survivor count', () => {
    // 4 agents, each uniquely solves one encounter, select 2
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }, { id: 'E3', resolved: false }, { id: 'E4', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: true }, { id: 'E3', resolved: false }, { id: 'E4', resolved: false }]),
      makeFitness('C', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: false }, { id: 'E3', resolved: true }, { id: 'E4', resolved: false }]),
      makeFitness('D', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: false }, { id: 'E3', resolved: false }, { id: 'E4', resolved: true }]),
    ];
    const survivors = selectSurvivorsWithNiches(fitness, 2);
    expect(survivors.length).toBe(2);
  });

  it('does not duplicate agents in survivor list', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true, score: 0.9 }, { id: 'E2', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: false }]),
    ];
    // A is both highest fitness AND a niche specialist — should only appear once
    const survivors = selectSurvivorsWithNiches(fitness, 2);
    const uniqueSurvivors = new Set(survivors);
    expect(uniqueSurvivors.size).toBe(survivors.length);
  });

  it('returns all agents when count >= population', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: false }]),
    ];
    const survivors = selectSurvivorsWithNiches(fitness, 5);
    expect(survivors.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// cf-04: Population health metrics
// ---------------------------------------------------------------------------

describe('computePopulationHealth', () => {
  it('computes collective coverage as fraction of encounters solved', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }, { id: 'E3', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: true }, { id: 'E3', resolved: false }]),
    ];
    const health = computePopulationHealth(fitness);
    // E1 and E2 are solved (by at least one), E3 is unsolved => 2/3
    expect(health.collectiveCoverage).toBeCloseTo(2 / 3);
  });

  it('full coverage when all encounters solved', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: true }]),
    ];
    const health = computePopulationHealth(fitness);
    expect(health.collectiveCoverage).toBe(1);
  });

  it('zero coverage when nothing solved', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: false }]),
    ];
    const health = computePopulationHealth(fitness);
    expect(health.collectiveCoverage).toBe(0);
  });

  it('counts unique tool compositions', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: true }]),
      makeFitness('C', [{ id: 'E1', resolved: true }]),
    ];
    const agents = [
      makeAgent('A', ['inspect', 'act'], 0),
      makeAgent('B', ['inspect', 'act'], 0), // same as A
      makeAgent('C', ['search', 'model'], 0), // different
    ];
    const health = computePopulationHealth(fitness, agents);
    expect(health.compositionDiversity).toBe(2);
  });

  it('counts niches (encounters with exactly one solver)', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: true }, { id: 'E3', resolved: false }]),
      makeFitness('B', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }, { id: 'E3', resolved: true }]),
    ];
    const health = computePopulationHealth(fitness);
    // E1 solved by both (not a niche), E2 uniquely by A (niche), E3 uniquely by B (niche)
    expect(health.nicheCount).toBe(2);
  });

  it('returns zero niches when all encounters shared', () => {
    const fitness = [
      makeFitness('A', [{ id: 'E1', resolved: true }]),
      makeFitness('B', [{ id: 'E1', resolved: true }]),
    ];
    const health = computePopulationHealth(fitness);
    expect(health.nicheCount).toBe(0);
  });

  it('handles empty population', () => {
    const health = computePopulationHealth([]);
    expect(health.collectiveCoverage).toBe(0);
    expect(health.nicheCount).toBe(0);
    expect(health.compositionDiversity).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// cf-05: Museum of beautiful failures (dead lineage export)
// ---------------------------------------------------------------------------

describe('extractDeadLineages', () => {
  const gen0Agents = [
    makeAgent('A', ['inspect', 'act'], 0),
    makeAgent('B', ['search', 'model'], 0),
    makeAgent('C', ['inspect', 'search'], 0),
  ];

  const gen0Fitness = [
    makeFitness('A', [{ id: 'E1', resolved: true, score: 0.9 }, { id: 'E2', resolved: true, score: 0.8 }]),
    makeFitness('B', [{ id: 'E1', resolved: false }, { id: 'E2', resolved: true, score: 0.6 }]),
    makeFitness('C', [{ id: 'E1', resolved: true, score: 0.4 }, { id: 'E2', resolved: false }]),
  ];

  const gen0: GenerationResult = {
    generation: 0,
    population: gen0Agents,
    fitness: gen0Fitness,
    survivors: ['A'], // B and C die
    mutations: [],
    crossovers: [],
    lineage: [],
    durationMs: 100,
  };

  it('identifies agents that did not survive', () => {
    const dead = extractDeadLineages([gen0]);
    const deadIds = dead.map(d => d.agentId);
    expect(deadIds).toContain('B');
    expect(deadIds).toContain('C');
    expect(deadIds).not.toContain('A');
  });

  it('records generation of birth and death', () => {
    const dead = extractDeadLineages([gen0]);
    const b = dead.find(d => d.agentId === 'B')!;
    expect(b.birthGeneration).toBe(0);
    expect(b.deathGeneration).toBe(0);
  });

  it('records tool composition', () => {
    const dead = extractDeadLineages([gen0]);
    const b = dead.find(d => d.agentId === 'B')!;
    expect(b.tools).toEqual(['search', 'model']);
  });

  it('records best and worst encounter', () => {
    const dead = extractDeadLineages([gen0]);
    const b = dead.find(d => d.agentId === 'B')!;
    expect(b.bestEncounterId).toBe('E2'); // resolved with 0.6
    expect(b.worstEncounterId).toBe('E1'); // failed
  });

  it('records cause of extinction as outcompeted', () => {
    const dead = extractDeadLineages([gen0]);
    const b = dead.find(d => d.agentId === 'B')!;
    expect(b.cause).toBe('outcompeted');
  });

  it('tracks agents surviving across generations then dying', () => {
    const gen1Agents = [
      makeAgent('A', ['inspect', 'act'], 1, 'survivor'),
      makeAgent('D', ['act', 'model'], 1, 'mutation'),
    ];
    const gen1: GenerationResult = {
      generation: 1,
      population: gen1Agents,
      fitness: [
        makeFitness('A', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: true }]),
        makeFitness('D', [{ id: 'E1', resolved: true }, { id: 'E2', resolved: false }]),
      ],
      survivors: ['D'], // A dies in gen 1
      mutations: [],
      crossovers: [],
      lineage: [],
      durationMs: 100,
    };

    const dead = extractDeadLineages([gen0, gen1]);
    const a = dead.find(d => d.agentId === 'A')!;
    expect(a.birthGeneration).toBe(0);
    expect(a.deathGeneration).toBe(1);
  });

  it('returns empty array when nobody dies', () => {
    const allSurvive: GenerationResult = {
      ...gen0,
      survivors: ['A', 'B', 'C'],
    };
    const dead = extractDeadLineages([allSurvive]);
    expect(dead).toEqual([]);
  });

  it('final generation population is not counted as dead', () => {
    // In the last generation, no selection happens — nobody is "dead"
    const dead = extractDeadLineages([gen0]);
    // B and C did not survive gen0's selection, so they ARE dead
    // But if gen0 is the final gen with all survivors...
    const finalGen: GenerationResult = {
      ...gen0,
      survivors: gen0Agents.map(a => a.id), // all survive final gen
    };
    expect(extractDeadLineages([finalGen])).toEqual([]);
  });
});
