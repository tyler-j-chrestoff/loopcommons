import { describe, it, expect } from 'vitest';
import type {
  MemoryContract,
  RecallOpts,
  RecallResult,
  OperationMeta,
  StoreReceipt,
  ConsolidationTrigger,
  ConsolidateStats,
} from '../src/contract';

describe('MemoryContract types', () => {
  // These tests verify the type definitions exist and have the right shape.
  // Pure type-level tests — they compile only if the types are correct.

  it('RecallOpts has limit and threshold fields', () => {
    const opts: RecallOpts = { limit: 10, threshold: 0.5 };
    expect(opts.limit).toBe(10);
    expect(opts.threshold).toBe(0.5);
  });

  it('RecallOpts fields are optional', () => {
    const opts: RecallOpts = {};
    expect(opts.limit).toBeUndefined();
    expect(opts.threshold).toBeUndefined();
  });

  it('RecallResult has capsules array and truncated flag', () => {
    const result: RecallResult = { capsules: [], truncated: false };
    expect(result.capsules).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('OperationMeta has ttl, priority, tags, uncertainty', () => {
    const meta: OperationMeta = {
      ttl: 'persistent',
      priority: 0.8,
      tags: ['test'],
      uncertainty: 0.3,
    };
    expect(meta.ttl).toBe('persistent');
    expect(meta.priority).toBe(0.8);
    expect(meta.tags).toEqual(['test']);
    expect(meta.uncertainty).toBe(0.3);
  });

  it('OperationMeta fields are all optional', () => {
    const meta: OperationMeta = {};
    expect(meta.ttl).toBeUndefined();
  });

  it('OperationMeta ttl supports session, persistent, and expiring', () => {
    const session: OperationMeta = { ttl: 'session' };
    const persistent: OperationMeta = { ttl: 'persistent' };
    const expiring: OperationMeta = { ttl: { type: 'expiring', durationMs: 60000 } };
    expect(session.ttl).toBe('session');
    expect(persistent.ttl).toBe('persistent');
    expect((expiring.ttl as { type: string; durationMs: number }).durationMs).toBe(60000);
  });

  it('StoreReceipt has id and timestamp', () => {
    const receipt: StoreReceipt = { id: 'abc-123', timestamp: '2026-03-20T00:00:00Z' };
    expect(receipt.id).toBe('abc-123');
    expect(receipt.timestamp).toBe('2026-03-20T00:00:00Z');
  });

  it('ConsolidationTrigger is a discriminated union', () => {
    const sessionEnd: ConsolidationTrigger = { type: 'session_end' };
    const pressure: ConsolidationTrigger = { type: 'pressure' };
    const scheduled: ConsolidationTrigger = { type: 'scheduled' };
    expect(sessionEnd.type).toBe('session_end');
    expect(pressure.type).toBe('pressure');
    expect(scheduled.type).toBe('scheduled');
  });

  it('ConsolidateStats has pruned and promoted counts', () => {
    const stats: ConsolidateStats = { pruned: 3, promoted: 2 };
    expect(stats.pruned).toBe(3);
    expect(stats.promoted).toBe(2);
  });

  it('MemoryContract has all 4 operations', () => {
    // Type-level verification: create a mock that satisfies the interface
    const contract: MemoryContract = {
      recall: async (_query, _opts?) => ({ capsules: [], truncated: false }),
      store: async (_capsule, _meta?) => ({ id: 'test', timestamp: new Date().toISOString() }),
      forget: async (_query) => {},
      consolidate: async (_trigger) => ({ pruned: 0, promoted: 0 }),
    };

    expect(typeof contract.recall).toBe('function');
    expect(typeof contract.store).toBe('function');
    expect(typeof contract.forget).toBe('function');
    expect(typeof contract.consolidate).toBe('function');
  });

  it('recall accepts query string and optional RecallOpts', async () => {
    const contract: MemoryContract = {
      recall: async (query, opts?) => {
        expect(typeof query).toBe('string');
        return { capsules: [], truncated: false };
      },
      store: async () => ({ id: 'test', timestamp: '' }),
      forget: async () => {},
      consolidate: async () => ({ pruned: 0, promoted: 0 }),
    };

    await contract.recall('test query', { limit: 5 });
  });

  it('store accepts MemoryInput and optional OperationMeta', async () => {
    const contract: MemoryContract = {
      recall: async () => ({ capsules: [], truncated: false }),
      store: async (input, meta?) => {
        expect(input.type).toBe('observation');
        expect(meta?.priority).toBe(0.9);
        return { id: 'stored-id', timestamp: new Date().toISOString() };
      },
      forget: async () => {},
      consolidate: async () => ({ pruned: 0, promoted: 0 }),
    };

    const receipt = await contract.store(
      { type: 'observation', subject: 'test', content: 'data' },
      { priority: 0.9 },
    );
    expect(receipt.id).toBe('stored-id');
  });

  it('forget accepts a query string', async () => {
    const contract: MemoryContract = {
      recall: async () => ({ capsules: [], truncated: false }),
      store: async () => ({ id: 'test', timestamp: '' }),
      forget: async (query) => {
        expect(typeof query).toBe('string');
      },
      consolidate: async () => ({ pruned: 0, promoted: 0 }),
    };

    await contract.forget('something to forget');
  });

  it('consolidate accepts ConsolidationTrigger and returns stats', async () => {
    const contract: MemoryContract = {
      recall: async () => ({ capsules: [], truncated: false }),
      store: async () => ({ id: 'test', timestamp: '' }),
      forget: async () => {},
      consolidate: async (trigger) => {
        expect(trigger.type).toBe('session_end');
        return { pruned: 1, promoted: 3 };
      },
    };

    const stats = await contract.consolidate({ type: 'session_end' });
    expect(stats.pruned).toBe(1);
    expect(stats.promoted).toBe(3);
  });
});
