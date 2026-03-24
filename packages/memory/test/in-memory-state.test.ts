import { describe, it, expect } from 'vitest';
import { createInMemoryState } from '../src/in-memory-state';
import type { Memory } from '../src/index';

const sampleMemory: Memory = {
  type: 'learning',
  id: 'mem-1',
  topic: 'incident response',
  insight: 'Check logs before restarting services',
  applicableTo: ['devops'],
  provenance: { agent: 'arena-agent', timestamp: '2026-03-24T00:00:00Z', used: [] },
  modality: 'belief',
  uncertainty: 0.3,
  visibility: 'local',
  tags: ['devops'],
  updatedAt: '2026-03-24T00:00:00Z',
  accessCount: 0,
};

const sampleMemory2: Memory = {
  type: 'observation',
  id: 'mem-2',
  subject: 'disk usage',
  content: 'Server disk at 90% capacity',
  provenance: { agent: 'arena-agent', timestamp: '2026-03-24T01:00:00Z', used: [] },
  modality: 'observation',
  uncertainty: 0.5,
  visibility: 'local',
  tags: ['monitoring'],
  updatedAt: '2026-03-24T01:00:00Z',
  accessCount: 0,
};

describe('InMemoryState', () => {
  it('constructs from empty string', () => {
    const state = createInMemoryState('');
    expect(state).toBeDefined();
  });

  it('constructs from serialized Memory[]', () => {
    const serialized = JSON.stringify([sampleMemory]);
    const state = createInMemoryState(serialized);
    expect(state).toBeDefined();
  });

  it('recall returns pre-loaded memories', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory, sampleMemory2]));
    const results = await state.recall({ limit: 10 });
    expect(results).toHaveLength(2);
  });

  it('recall filters by type', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory, sampleMemory2]));
    const results = await state.recall({ type: 'learning', limit: 10 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('mem-1');
  });

  it('recall respects limit', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory, sampleMemory2]));
    const results = await state.recall({ limit: 1 });
    expect(results).toHaveLength(1);
  });

  it('recall sorts by uncertainty asc then updatedAt desc', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory2, sampleMemory]));
    const results = await state.recall({ limit: 10 });
    // sampleMemory has uncertainty 0.3, sampleMemory2 has 0.5
    expect(results[0].id).toBe('mem-1');
    expect(results[1].id).toBe('mem-2');
  });

  it('remember adds a new memory', async () => {
    const state = createInMemoryState('');
    const mem = await state.remember({
      type: 'observation',
      subject: 'cpu',
      content: 'CPU spike at 95%',
    });
    expect(mem.type).toBe('observation');
    expect(mem.id).toBeTruthy();
    const results = await state.recall({ limit: 10 });
    expect(results).toHaveLength(1);
  });

  it('stats returns correct counts', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory, sampleMemory2]));
    const s = await state.stats();
    expect(s.totalEntries).toBe(2);
    expect(s.byType.learning).toBe(1);
    expect(s.byType.observation).toBe(1);
  });

  it('serialize round-trips', async () => {
    const state = createInMemoryState(JSON.stringify([sampleMemory]));
    await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'added after construction',
    });
    const serialized = state.serialize();
    const parsed = JSON.parse(serialized);
    expect(parsed).toHaveLength(2);

    // Round-trip: create new state from serialized
    const state2 = createInMemoryState(serialized);
    const results = await state2.recall({ limit: 10 });
    expect(results).toHaveLength(2);
  });

  it('constructs from invalid JSON gracefully', () => {
    const state = createInMemoryState('not json');
    expect(state).toBeDefined();
  });

  it('recall returns empty for empty state', async () => {
    const state = createInMemoryState('');
    const results = await state.recall({ limit: 10 });
    expect(results).toHaveLength(0);
  });
});
