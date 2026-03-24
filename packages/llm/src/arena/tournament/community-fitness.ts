/**
 * Community fitness: marginal contribution, niche-preserving selection,
 * population health metrics, and dead lineage extraction.
 *
 * The unit of evolution is the community, not the individual.
 */

import type { AgentFitness, GenerationResult, PopulationHealth, TournamentAgent } from './types';
import { rankPopulation } from './fitness';

// ---------------------------------------------------------------------------
// cf-02: Marginal contribution
// ---------------------------------------------------------------------------

/**
 * For each agent, count encounters that ONLY this agent resolves.
 * Returns Map<agentId, uniqueSolveCount>.
 */
export function computeMarginalContribution(
  fitness: AgentFitness[],
): Map<string, number> {
  const result = new Map<string, number>();

  if (fitness.length === 0) return result;

  // Collect all encounter IDs
  const encounterIds = new Set<string>();
  for (const f of fitness) {
    for (const t of f.taskResults) {
      encounterIds.add(t.encounterId);
    }
  }

  // For each encounter, find which agents resolve it
  for (const encId of encounterIds) {
    const solvers: string[] = [];
    for (const f of fitness) {
      const task = f.taskResults.find(t => t.encounterId === encId);
      if (task?.resolved) {
        solvers.push(f.agentId);
      }
    }
    // If exactly one agent solves it, that's marginal contribution
    if (solvers.length === 1) {
      const agentId = solvers[0];
      result.set(agentId, (result.get(agentId) ?? 0) + 1);
    }
  }

  // Ensure all agents have an entry
  for (const f of fitness) {
    if (!result.has(f.agentId)) {
      result.set(f.agentId, 0);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// cf-03: Niche-preserving selection
// ---------------------------------------------------------------------------

/**
 * Select survivors with niche preservation.
 *
 * 1. Identify niche specialists (agents with marginal contribution > 0)
 * 2. Reserve slots for niche specialists, ranked by marginal contribution
 * 3. Fill remaining slots with highest individual fitness (excluding already-selected)
 */
export function selectSurvivorsWithNiches(
  fitness: AgentFitness[],
  count: number,
): string[] {
  if (fitness.length <= count) {
    return fitness.map(f => f.agentId);
  }

  const mc = computeMarginalContribution(fitness);
  const selected = new Set<string>();

  // Step 1: Niche specialists — agents with unique solves, ranked by contribution count
  const specialists = [...mc.entries()]
    .filter(([, contribution]) => contribution > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [agentId] of specialists) {
    if (selected.size >= count) break;
    selected.add(agentId);
  }

  // Step 2: Fill remaining slots by individual fitness
  const ranked = rankPopulation(fitness);
  for (const f of ranked) {
    if (selected.size >= count) break;
    selected.add(f.agentId);
  }

  return [...selected];
}

// ---------------------------------------------------------------------------
// cf-04: Population health metrics
// ---------------------------------------------------------------------------

/**
 * Compute population-level health metrics.
 * Agents are optional — if omitted, compositionDiversity is 0.
 */
export function computePopulationHealth(
  fitness: AgentFitness[],
  agents?: TournamentAgent[],
): PopulationHealth {
  if (fitness.length === 0) {
    return { collectiveCoverage: 0, compositionDiversity: 0, nicheCount: 0 };
  }

  // Collect all encounter IDs and their solver counts
  const encounterSolverCount = new Map<string, number>();
  for (const f of fitness) {
    for (const t of f.taskResults) {
      if (!encounterSolverCount.has(t.encounterId)) {
        encounterSolverCount.set(t.encounterId, 0);
      }
      if (t.resolved) {
        encounterSolverCount.set(
          t.encounterId,
          encounterSolverCount.get(t.encounterId)! + 1,
        );
      }
    }
  }

  const totalEncounters = encounterSolverCount.size;
  let solvedCount = 0;
  let nicheCount = 0;

  for (const [, solvers] of encounterSolverCount) {
    if (solvers > 0) solvedCount++;
    if (solvers === 1) nicheCount++;
  }

  const collectiveCoverage = totalEncounters > 0 ? solvedCount / totalEncounters : 0;

  // Composition diversity: unique tool sets
  let compositionDiversity = 0;
  if (agents && agents.length > 0) {
    const compositions = new Set(agents.map(a => [...a.tools].sort().join(',')));
    compositionDiversity = compositions.size;
  }

  return { collectiveCoverage, compositionDiversity, nicheCount };
}

// ---------------------------------------------------------------------------
// cf-05: Museum of beautiful failures (dead lineage extraction)
// ---------------------------------------------------------------------------

export type DeadLineage = {
  agentId: string;
  tools: string[];
  birthGeneration: number;
  deathGeneration: number;
  bestEncounterId: string;
  worstEncounterId: string;
  bestScore: number;
  worstScore: number;
  fitnessScore: number;
  cause: 'outcompeted';
};

/**
 * Extract dead lineages from generation history.
 * An agent is "dead" if it appeared in a generation's population
 * but was not in that generation's survivors list.
 */
export function extractDeadLineages(generations: GenerationResult[]): DeadLineage[] {
  if (generations.length === 0) return [];

  // Track first appearance (birth) of each agent
  const birthGen = new Map<string, number>();
  const agentData = new Map<string, { tools: string[]; fitness: AgentFitness }>();

  const dead: DeadLineage[] = [];

  for (const gen of generations) {
    // Record births
    for (const agent of gen.population) {
      if (!birthGen.has(agent.id)) {
        birthGen.set(agent.id, agent.generation);
      }
    }

    // Record latest fitness
    for (const agent of gen.population) {
      const fit = gen.fitness.find(f => f.agentId === agent.id);
      if (fit) {
        agentData.set(agent.id, { tools: agent.tools, fitness: fit });
      }
    }

    // Find who died: in population but not in survivors
    const survivorSet = new Set(gen.survivors);
    for (const agent of gen.population) {
      if (!survivorSet.has(agent.id)) {
        const data = agentData.get(agent.id);
        const fit = data?.fitness;
        if (!fit) continue;

        // Find best and worst encounters by score
        const sorted = [...fit.taskResults].sort((a, b) => b.score - a.score);
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];

        dead.push({
          agentId: agent.id,
          tools: data.tools,
          birthGeneration: birthGen.get(agent.id) ?? gen.generation,
          deathGeneration: gen.generation,
          bestEncounterId: best?.encounterId ?? '',
          worstEncounterId: worst?.encounterId ?? '',
          bestScore: best?.score ?? 0,
          worstScore: worst?.score ?? 0,
          fitnessScore: fit.fitnessScore,
          cause: 'outcompeted',
        });
      }
    }
  }

  return dead;
}
