import { describe, it, expect } from 'vitest';
import {
  mutateAdd,
  mutateRemove,
  mutateSwap,
  mutateAgent,
} from '../../../src/arena/tournament/mutation';
import type { ArenaToolId } from '../../../src/arena/types';

const ALL_TOOLS: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];

describe('mutation operators', () => {
  describe('mutateAdd', () => {
    it('adds a tool not already present', () => {
      const current: ArenaToolId[] = ['inspect', 'act'];
      const result = mutateAdd(current, ALL_TOOLS, 4);
      expect(result.length).toBe(3);
      expect(result).toContain('inspect');
      expect(result).toContain('act');
      // The added tool must be one of ['search', 'model']
      const added = result.filter(t => !current.includes(t));
      expect(added.length).toBe(1);
      expect(['search', 'model']).toContain(added[0]);
    });

    it('returns current tools unchanged if already at maxTools', () => {
      const current: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];
      const result = mutateAdd(current, ALL_TOOLS, 4);
      expect(result).toEqual(current);
    });

    it('returns current tools unchanged if all tools already present', () => {
      const current: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];
      const result = mutateAdd(current, ALL_TOOLS, 5);
      expect(result).toEqual(current);
    });
  });

  describe('mutateRemove', () => {
    it('removes one tool', () => {
      const current: ArenaToolId[] = ['inspect', 'act', 'search'];
      const result = mutateRemove(current, 1);
      expect(result.length).toBe(2);
      // All remaining tools must be from original set
      result.forEach(t => expect(current).toContain(t));
    });

    it('returns current tools unchanged if already at minTools', () => {
      const current: ArenaToolId[] = ['inspect'];
      const result = mutateRemove(current, 1);
      expect(result).toEqual(current);
    });
  });

  describe('mutateSwap', () => {
    it('swaps one tool for another', () => {
      const current: ArenaToolId[] = ['inspect', 'act'];
      const result = mutateSwap(current, ALL_TOOLS);
      expect(result.length).toBe(2);
      // Exactly one tool changed
      const removed = current.filter(t => !result.includes(t));
      const added = result.filter(t => !current.includes(t));
      expect(removed.length).toBe(1);
      expect(added.length).toBe(1);
      expect(ALL_TOOLS).toContain(added[0]);
    });

    it('returns current tools unchanged if all pool tools already present', () => {
      const current: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];
      const result = mutateSwap(current, ALL_TOOLS);
      expect(result).toEqual(current);
    });
  });

  describe('mutateAgent', () => {
    it('returns a MutationRecord with correct metadata', () => {
      const tools: ArenaToolId[] = ['inspect', 'act'];
      const record = mutateAgent(tools, ALL_TOOLS, 1, 4);
      expect(record.newTools.length).toBeGreaterThanOrEqual(1);
      expect(record.newTools.length).toBeLessThanOrEqual(4);
      expect(['add', 'remove', 'swap']).toContain(record.type);
    });

    it('always produces valid tool sets (within bounds)', () => {
      // Run many times to test stochastic behavior
      for (let i = 0; i < 50; i++) {
        const tools: ArenaToolId[] = ['inspect', 'act'];
        const record = mutateAgent(tools, ALL_TOOLS, 1, 4);
        expect(record.newTools.length).toBeGreaterThanOrEqual(1);
        expect(record.newTools.length).toBeLessThanOrEqual(4);
        // All tools must be from pool
        record.newTools.forEach(t => expect(ALL_TOOLS).toContain(t));
        // No duplicates
        expect(new Set(record.newTools).size).toBe(record.newTools.length);
      }
    });
  });
});
