/**
 * Population management for tournament evolution.
 *
 * Handles seeding from roguelike survivors, mutation, crossover, and
 * generation assembly.
 */

import * as crypto from 'node:crypto';
import type { ArenaToolId } from '../types';
import type {
  TournamentAgent,
  AgentFitness,
  MutationRecord,
  CrossoverRecord,
} from './types';
import { computeIdentity, buildAgentIdentity } from '../../identity';
import { mutateAgent } from './mutation';
import { crossoverAgents } from './crossover';
import { rankPopulation, selectSurvivors } from './fitness';
import { selectSurvivorsWithNiches } from './community-fitness';

// ---------------------------------------------------------------------------
// Seed creation
// ---------------------------------------------------------------------------

export async function createSeedAgent(config: {
  tools: ArenaToolId[];
  memoryState: string;
  commitSha: string;
}): Promise<TournamentAgent> {
  const id = crypto.randomUUID();
  const toolCompositionHash = await computeIdentity(config.commitSha, config.tools);
  return {
    id,
    tools: config.tools,
    memoryState: config.memoryState,
    identity: {
      commitSha: config.commitSha,
      toolCompositionHash,
      derivedPromptHash: toolCompositionHash, // same for arena (no domain knowledge)
    },
    generation: 0,
    origin: 'seed',
    parentIds: [],
  };
}

export async function createPopulationFromSeeds(
  seeds: Array<{ tools: ArenaToolId[]; memoryState: string }>,
  commitSha: string,
): Promise<TournamentAgent[]> {
  return Promise.all(
    seeds.map(s => createSeedAgent({ ...s, commitSha })),
  );
}

// ---------------------------------------------------------------------------
// Mutation
// ---------------------------------------------------------------------------

type MutationConfig = {
  toolPool: ArenaToolId[];
  minTools: number;
  maxTools: number;
  generation: number;
  commitSha: string;
};

export async function applyMutations(
  survivors: TournamentAgent[],
  count: number,
  config: MutationConfig,
): Promise<{ agents: TournamentAgent[]; records: MutationRecord[] }> {
  const agents: TournamentAgent[] = [];
  const records: MutationRecord[] = [];

  for (let i = 0; i < count; i++) {
    // Pick a random survivor to mutate
    const parent = survivors[Math.floor(Math.random() * survivors.length)];
    const result = mutateAgent(parent.tools, config.toolPool, config.minTools, config.maxTools);

    const id = crypto.randomUUID();
    const toolCompositionHash = await computeIdentity(config.commitSha, result.newTools);

    agents.push({
      id,
      tools: result.newTools,
      memoryState: parent.memoryState, // inherit parent's memory
      identity: {
        commitSha: config.commitSha,
        toolCompositionHash,
        derivedPromptHash: toolCompositionHash,
      },
      generation: config.generation,
      origin: 'mutation',
      parentIds: [parent.id],
    });

    records.push({
      parentId: parent.id,
      childId: id,
      type: result.type,
      toolAdded: result.toolAdded,
      toolRemoved: result.toolRemoved,
    });
  }

  return { agents, records };
}

// ---------------------------------------------------------------------------
// Crossover
// ---------------------------------------------------------------------------

type CrossoverConfig = {
  generation: number;
  commitSha: string;
};

export async function applyCrossovers(
  survivors: TournamentAgent[],
  count: number,
  fitnessMap: Map<string, number>,
  config: CrossoverConfig,
): Promise<{ agents: TournamentAgent[]; records: CrossoverRecord[] }> {
  const agents: TournamentAgent[] = [];
  const records: CrossoverRecord[] = [];

  for (let i = 0; i < count; i++) {
    // Pick two distinct survivors
    const idx1 = Math.floor(Math.random() * survivors.length);
    let idx2 = Math.floor(Math.random() * (survivors.length - 1));
    if (idx2 >= idx1) idx2++;

    const parent1 = survivors[idx1];
    const parent2 = survivors[idx2];

    const fitness1 = fitnessMap.get(parent1.id) ?? 0;
    const fitness2 = fitnessMap.get(parent2.id) ?? 0;

    const result = crossoverAgents(
      { tools: parent1.tools, memoryState: parent1.memoryState, fitness: fitness1 },
      { tools: parent2.tools, memoryState: parent2.memoryState, fitness: fitness2 },
      { parentIds: [parent1.id, parent2.id] },
    );

    // Child inherits fitter parent's tools
    const childTools = fitness1 >= fitness2 ? parent1.tools : parent2.tools;

    const id = crypto.randomUUID();
    const toolCompositionHash = await computeIdentity(config.commitSha, childTools);

    agents.push({
      id,
      tools: childTools,
      memoryState: result.mergedMemory,
      identity: {
        commitSha: config.commitSha,
        toolCompositionHash,
        derivedPromptHash: toolCompositionHash,
      },
      generation: config.generation,
      origin: 'crossover',
      parentIds: [parent1.id, parent2.id],
    });

    records.push({
      parent1Id: parent1.id,
      parent2Id: parent2.id,
      childId: id,
      memoryCounts: result.memoryCounts,
    });
  }

  return { agents, records };
}

// ---------------------------------------------------------------------------
// Build next generation
// ---------------------------------------------------------------------------

type NextGenConfig = {
  currentPopulation: TournamentAgent[];
  fitness: AgentFitness[];
  survivorCount: number;
  mutationCount: number;
  crossoverCount: number;
  toolPool: ArenaToolId[];
  minTools: number;
  maxTools: number;
  generation: number;
  commitSha: string;
  /** Use niche-preserving selection instead of top-N. */
  nicheSelection?: boolean;
};

export async function buildNextGeneration(config: NextGenConfig): Promise<{
  population: TournamentAgent[];
  survivors: string[];
  mutations: MutationRecord[];
  crossovers: CrossoverRecord[];
}> {
  const survivorIds = config.nicheSelection
    ? selectSurvivorsWithNiches(config.fitness, config.survivorCount)
    : selectSurvivors(config.fitness, config.survivorCount);
  const survivorAgents = config.currentPopulation.filter(a => survivorIds.includes(a.id));

  // Mark survivors as 'survivor' origin in the new generation
  const carryOver = survivorAgents.map(a => ({
    ...a,
    generation: config.generation,
    origin: 'survivor' as const,
  }));

  const fitnessMap = new Map<string, number>(
    config.fitness.map(f => [f.agentId, f.fitnessScore]),
  );

  const mutationResult = await applyMutations(survivorAgents, config.mutationCount, {
    toolPool: config.toolPool,
    minTools: config.minTools,
    maxTools: config.maxTools,
    generation: config.generation,
    commitSha: config.commitSha,
  });

  const crossoverResult = await applyCrossovers(
    survivorAgents,
    config.crossoverCount,
    fitnessMap,
    { generation: config.generation, commitSha: config.commitSha },
  );

  return {
    population: [...carryOver, ...mutationResult.agents, ...crossoverResult.agents],
    survivors: survivorIds,
    mutations: mutationResult.records,
    crossovers: crossoverResult.records,
  };
}
