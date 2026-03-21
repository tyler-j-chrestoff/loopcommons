import { describe, it, expect } from 'vitest';
import {
  mergeMemoryStates,
  crossoverAgents,
} from '../../../src/arena/tournament/crossover';

describe('memory crossover', () => {
  const makeMemory = (id: string, content: string, uncertainty = 0.5) =>
    JSON.stringify([{
      id,
      type: 'observation',
      subject: `subject-${id}`,
      content,
      provenance: { agent: 'test', timestamp: '2026-01-01T00:00:00Z', used: [] },
      modality: 'observation',
      uncertainty,
      visibility: 'local',
      tags: [],
      updatedAt: '2026-01-01T00:00:00Z',
      accessCount: 0,
    }]);

  describe('mergeMemoryStates', () => {
    it('unions capsules from both parents', () => {
      const a = makeMemory('a1', 'memory from parent A');
      const b = makeMemory('b1', 'memory from parent B');
      const merged = mergeMemoryStates(a, b, 0.8, 0.6);
      const entries = JSON.parse(merged);
      expect(entries.length).toBe(2);
    });

    it('applies fitness-weighted uncertainty adjustment', () => {
      const a = makeMemory('a1', 'memory from fitter parent', 0.3);
      const b = makeMemory('b1', 'memory from less fit parent', 0.3);
      const merged = mergeMemoryStates(a, b, 0.9, 0.5);
      const entries = JSON.parse(merged);
      // Higher fitness parent's memories should have lower uncertainty
      const fromA = entries.find((e: any) => e.id === 'a1');
      const fromB = entries.find((e: any) => e.id === 'b1');
      expect(fromA.uncertainty).toBeLessThan(fromB.uncertainty);
    });

    it('handles empty memory states', () => {
      const empty = JSON.stringify([]);
      const b = makeMemory('b1', 'solo memory');
      const merged = mergeMemoryStates(empty, b, 0.5, 0.5);
      const entries = JSON.parse(merged);
      expect(entries.length).toBe(1);
    });

    it('caps total entries at 2x the larger parent', () => {
      // Create parents with many entries
      const manyEntries = Array.from({ length: 20 }, (_, i) => ({
        id: `a${i}`,
        type: 'observation',
        subject: `subject-${i}`,
        content: `memory ${i}`,
        provenance: { agent: 'test', timestamp: '2026-01-01T00:00:00Z', used: [] },
        modality: 'observation',
        uncertainty: 0.5,
        visibility: 'local',
        tags: [],
        updatedAt: '2026-01-01T00:00:00Z',
        accessCount: 0,
      }));
      const a = JSON.stringify(manyEntries);
      const b = JSON.stringify(manyEntries.map(e => ({ ...e, id: `b${e.id.slice(1)}` })));
      const merged = mergeMemoryStates(a, b, 0.5, 0.5);
      const entries = JSON.parse(merged);
      // Should cap at 2 * 20 = 40
      expect(entries.length).toBeLessThanOrEqual(40);
    });

    it('adds provenance.parent field to track origin', () => {
      const a = makeMemory('a1', 'from A');
      const b = makeMemory('b1', 'from B');
      const merged = mergeMemoryStates(a, b, 0.5, 0.5, 'parent-a', 'parent-b');
      const entries = JSON.parse(merged);
      const fromA = entries.find((e: any) => e.id === 'a1');
      const fromB = entries.find((e: any) => e.id === 'b1');
      expect(fromA.provenance.source).toBe('crossover:parent-a');
      expect(fromB.provenance.source).toBe('crossover:parent-b');
    });
  });

  describe('crossoverAgents', () => {
    it('returns merged tools and memory', () => {
      const result = crossoverAgents(
        { tools: ['inspect', 'act'], memoryState: makeMemory('a1', 'A'), fitness: 0.8 },
        { tools: ['search', 'model'], memoryState: makeMemory('b1', 'B'), fitness: 0.6 },
        { parentIds: ['p1', 'p2'] },
      );
      expect(result.mergedMemory).toBeDefined();
      expect(result.memoryCounts.parent1).toBe(1);
      expect(result.memoryCounts.parent2).toBe(1);
      expect(result.memoryCounts.merged).toBe(2);
    });
  });
});
