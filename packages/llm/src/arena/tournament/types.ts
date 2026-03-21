/**
 * Tournament types for evolutionary selection over tool compositions.
 *
 * Two-phase evolution:
 *   1. Roguelike seeding: diverse survivors become generation 0
 *   2. Tournament selection: evaluate → rank → select → mutate/crossover
 */

import type { ArenaToolId, EncounterConfig, RunTrace } from '../types';
import type { AgentIdentity, LineageRecord } from '../../identity';
import type { ManaConfig } from '../mana';

// ---------------------------------------------------------------------------
// Agent representation
// ---------------------------------------------------------------------------

/** A single agent in the population. */
export type TournamentAgent = {
  /** Unique ID within this tournament. */
  id: string;
  /** Current tool set. */
  tools: ArenaToolId[];
  /** Serialized memory state (JSON string of Memory[]). */
  memoryState: string;
  /** Content-addressed identity hash. */
  identity: AgentIdentity;
  /** Which generation this agent was created in. */
  generation: number;
  /** How this agent was created. */
  origin: AgentOrigin;
  /** Parent agent ID(s), if any. */
  parentIds: string[];
};

export type AgentOrigin =
  | 'seed'       // from roguelike survivor
  | 'survivor'   // survived selection
  | 'mutation'   // mutated from a survivor
  | 'crossover'; // memory crossover of two survivors

// ---------------------------------------------------------------------------
// Fitness
// ---------------------------------------------------------------------------

export type TaskResult = {
  encounterId: string;
  resolved: boolean;
  score: number;
  stepCount: number;
  died: boolean;
  costEstimate: number;
  /** Collateral damage score (0 = clean, higher = more damage). Optional for backward compat. */
  collateral?: number;
};

export type AgentFitness = {
  agentId: string;
  taskResults: TaskResult[];
  /** Weighted composite score (higher = better). */
  fitnessScore: number;
  /** Per-dimension breakdown. */
  metrics: {
    /** Fraction of tasks resolved. */
    completionRate: number;
    /** Average score across tasks. */
    meanScore: number;
    /** Average steps per task (lower = more efficient). */
    meanSteps: number;
    /** Fraction of tasks where agent survived. */
    survivalRate: number;
    /** Total estimated cost across all tasks. */
    totalCost: number;
    /** Mean collateral damage (0 = clean, 1 = max damage). */
    meanCollateral: number;
  };
};

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export type GenerationResult = {
  generation: number;
  population: TournamentAgent[];
  fitness: AgentFitness[];
  /** Agents selected to survive (by ID). */
  survivors: string[];
  /** Mutations applied this generation. */
  mutations: MutationRecord[];
  /** Crossovers applied this generation. */
  crossovers: CrossoverRecord[];
  /** Lineage records for all new agents. */
  lineage: LineageRecord[];
  /** Wall-clock duration of this generation. */
  durationMs: number;
};

export type MutationRecord = {
  parentId: string;
  childId: string;
  type: 'add' | 'remove' | 'swap';
  toolAdded: ArenaToolId | null;
  toolRemoved: ArenaToolId | null;
};

export type CrossoverRecord = {
  parent1Id: string;
  parent2Id: string;
  childId: string;
  /** Number of memory capsules from each parent before consolidation. */
  memoryCounts: { parent1: number; parent2: number; merged: number };
};

// ---------------------------------------------------------------------------
// Tournament configuration
// ---------------------------------------------------------------------------

export type TournamentConfig = {
  /** Task battery for evaluating agents. */
  encounters: EncounterConfig[];
  /** Maximum generations to run. */
  maxGenerations: number;
  /** Population size per generation. */
  populationSize: number;
  /** Number of top agents that survive selection. */
  survivorCount: number;
  /** Number of mutations per generation. */
  mutationCount: number;
  /** Number of crossovers per generation. */
  crossoverCount: number;
  /** All available tools (the pool agents draw from). */
  toolPool: ArenaToolId[];
  /** Minimum tools an agent must have. */
  minTools: number;
  /** Maximum tools an agent can have. */
  maxTools: number;
  /** LLM model for agent runs. */
  model: string;
  /** Max steps per encounter. */
  maxStepsPerEncounter: number;
  /** Stop early if best fitness hasn't improved for N generations. */
  convergenceWindow: number;
  /** Git commit SHA for identity hashing. */
  commitSha: string;
  /** Optional mana config for phase-gated tool access. */
  manaConfig?: ManaConfig;
};

// ---------------------------------------------------------------------------
// Tournament trace (full run output)
// ---------------------------------------------------------------------------

export type TournamentTrace = {
  tournamentId: string;
  config: TournamentConfig;
  generations: GenerationResult[];
  startedAt: string;
  completedAt: string;
  /** Best agent across all generations. */
  winner: TournamentAgent | null;
  /** Best fitness score across all generations. */
  bestFitness: number;
};

// ---------------------------------------------------------------------------
// Event types for streaming progress
// ---------------------------------------------------------------------------

export type TournamentEvent =
  | { type: 'tournament:start'; config: TournamentConfig }
  | { type: 'generation:start'; generation: number }
  | { type: 'evaluation:complete'; generation: number; agentId: string; fitness: AgentFitness }
  | { type: 'selection:complete'; generation: number; survivors: string[] }
  | { type: 'generation:complete'; result: GenerationResult }
  | { type: 'tournament:complete'; trace: TournamentTrace }
  | { type: 'tournament:converged'; generation: number; bestFitness: number };
