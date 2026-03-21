/**
 * Mutation operators for tournament evolution.
 *
 * Three operators: add (gain one tool), remove (lose one tool), swap (exchange one).
 * All respect min/max tool constraints and pool membership.
 */

import type { ArenaToolId } from '../types';

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Add a tool not already present. Returns current tools unchanged if at max
 * capacity or all pool tools are already present.
 */
export function mutateAdd(
  current: ArenaToolId[],
  pool: ArenaToolId[],
  maxTools: number,
): ArenaToolId[] {
  if (current.length >= maxTools) return current;
  const candidates = pool.filter(t => !current.includes(t));
  if (candidates.length === 0) return current;
  return [...current, pickRandom(candidates)];
}

/**
 * Remove one tool. Returns current tools unchanged if at min capacity.
 */
export function mutateRemove(
  current: ArenaToolId[],
  minTools: number,
): ArenaToolId[] {
  if (current.length <= minTools) return current;
  const idx = Math.floor(Math.random() * current.length);
  return current.filter((_, i) => i !== idx);
}

/**
 * Swap one tool for another from the pool. Returns current tools unchanged
 * if all pool tools are already present (nothing to swap in).
 */
export function mutateSwap(
  current: ArenaToolId[],
  pool: ArenaToolId[],
): ArenaToolId[] {
  const candidates = pool.filter(t => !current.includes(t));
  if (candidates.length === 0) return current;
  const removeIdx = Math.floor(Math.random() * current.length);
  const addTool = pickRandom(candidates);
  return current.map((t, i) => i === removeIdx ? addTool : t);
}

export type MutationResult = {
  newTools: ArenaToolId[];
  type: 'add' | 'remove' | 'swap';
  toolAdded: ArenaToolId | null;
  toolRemoved: ArenaToolId | null;
};

/**
 * Apply a random mutation to a tool set. Picks add/remove/swap with equal
 * probability, falling back if the chosen operation is a no-op.
 */
export function mutateAgent(
  tools: ArenaToolId[],
  pool: ArenaToolId[],
  minTools: number,
  maxTools: number,
): MutationResult {
  const ops: Array<'add' | 'remove' | 'swap'> = ['add', 'remove', 'swap'];
  // Shuffle to randomize which we try first
  for (let i = ops.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ops[i], ops[j]] = [ops[j], ops[i]];
  }

  for (const op of ops) {
    let result: ArenaToolId[];
    switch (op) {
      case 'add':
        result = mutateAdd(tools, pool, maxTools);
        break;
      case 'remove':
        result = mutateRemove(tools, minTools);
        break;
      case 'swap':
        result = mutateSwap(tools, pool);
        break;
    }

    // If the operation changed something, return it
    if (result.length !== tools.length || !result.every((t, i) => t === tools[i])) {
      const removed = tools.filter(t => !result.includes(t));
      const added = result.filter(t => !tools.includes(t));
      return {
        newTools: result,
        type: op,
        toolAdded: added[0] ?? null,
        toolRemoved: removed[0] ?? null,
      };
    }
  }

  // All operations were no-ops (e.g., single tool, all tools present)
  return {
    newTools: [...tools],
    type: 'swap',
    toolAdded: null,
    toolRemoved: null,
  };
}
