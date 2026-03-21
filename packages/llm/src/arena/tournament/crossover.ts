/**
 * Memory crossover for tournament evolution.
 *
 * Strategy A: fitness-weighted union + cap at 2x larger parent.
 * The existing hippocampal consolidation (called separately) acts as the
 * compression bottleneck that decides what survives from the union.
 */

type CrossoverParent = {
  tools: string[];
  memoryState: string;
  fitness: number;
};

type CrossoverOptions = {
  parentIds: [string, string];
};

type CrossoverResult = {
  mergedMemory: string;
  memoryCounts: { parent1: number; parent2: number; merged: number };
};

/**
 * Merge two serialized memory states (JSON arrays of Memory capsules).
 *
 * - Union all capsules from both parents
 * - Apply fitness-weighted uncertainty adjustment (fitter parent's memories
 *   get lower uncertainty)
 * - Cap total entries at 2x the larger parent's count
 * - Tag provenance.source with parent origin for traceability
 */
export function mergeMemoryStates(
  stateA: string,
  stateB: string,
  fitnessA: number,
  fitnessB: number,
  parentIdA?: string,
  parentIdB?: string,
): string {
  const entriesA: any[] = JSON.parse(stateA);
  const entriesB: any[] = JSON.parse(stateB);

  const totalFitness = fitnessA + fitnessB;
  // Avoid division by zero
  const weightA = totalFitness > 0 ? fitnessA / totalFitness : 0.5;
  const weightB = totalFitness > 0 ? fitnessB / totalFitness : 0.5;

  // Uncertainty adjustment: fitter parent's memories get reduced uncertainty
  // The adjustment scales inversely with relative fitness
  const adjustA = (1 - weightA) * 0.2; // less fit → more uncertainty added
  const adjustB = (1 - weightB) * 0.2;

  for (const entry of entriesA) {
    entry.uncertainty = Math.min(1, Math.max(0, entry.uncertainty + adjustA));
    if (parentIdA) {
      entry.provenance = { ...entry.provenance, source: `crossover:${parentIdA}` };
    }
  }

  for (const entry of entriesB) {
    entry.uncertainty = Math.min(1, Math.max(0, entry.uncertainty + adjustB));
    if (parentIdB) {
      entry.provenance = { ...entry.provenance, source: `crossover:${parentIdB}` };
    }
  }

  let merged = [...entriesA, ...entriesB];

  // Cap at 2x the larger parent's count
  const maxEntries = 2 * Math.max(entriesA.length, entriesB.length);
  if (merged.length > maxEntries) {
    // Keep lowest-uncertainty entries (most confident memories survive)
    merged.sort((a, b) => a.uncertainty - b.uncertainty);
    merged = merged.slice(0, maxEntries);
  }

  return JSON.stringify(merged);
}

/**
 * Crossover two agents: merge their memory states with fitness weighting.
 *
 * Tool composition for the child is determined by the caller (typically
 * inherits from the fitter parent or uses union). This function only
 * handles the memory merge.
 */
export function crossoverAgents(
  parent1: CrossoverParent,
  parent2: CrossoverParent,
  options: { parentIds: [string, string] },
): CrossoverResult {
  const entriesA: any[] = JSON.parse(parent1.memoryState);
  const entriesB: any[] = JSON.parse(parent2.memoryState);

  const mergedMemory = mergeMemoryStates(
    parent1.memoryState,
    parent2.memoryState,
    parent1.fitness,
    parent2.fitness,
    options.parentIds[0],
    options.parentIds[1],
  );

  const mergedEntries: any[] = JSON.parse(mergedMemory);

  return {
    mergedMemory,
    memoryCounts: {
      parent1: entriesA.length,
      parent2: entriesB.length,
      merged: mergedEntries.length,
    },
  };
}
