import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createNullMemoryPackage } from '../src/null-package';
import { createKeywordMemoryPackage } from '../src/keyword-package';
import { createEmbeddingMemoryPackage } from '../src/embedding-package';
import type { MemoryContract } from '../src/contract';
import type { EmbedFn } from '../src/embedding';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'contract-swap-'));
  return path.join(dir, 'test-memory.json');
}

function mockEmbed(): EmbedFn {
  return vi.fn(async (text: string) => {
    const codes = text.split('').slice(0, 4).map((c) => c.charCodeAt(0) / 200);
    while (codes.length < 4) codes.push(0);
    return codes;
  });
}

// ---------------------------------------------------------------------------
// Shared contract test suite — all strategies must pass these
// ---------------------------------------------------------------------------

function runMemoryContractTests(
  name: string,
  createContract: () => { contract: MemoryContract; tools: any[]; metadata: any; systemMethods?: any },
) {
  describe(`MemoryContract: ${name}`, () => {
    it('recall returns RecallResult shape', async () => {
      const { contract } = createContract();
      const result = await contract.recall('test');
      expect(result).toHaveProperty('capsules');
      expect(result).toHaveProperty('truncated');
      expect(Array.isArray(result.capsules)).toBe(true);
      expect(typeof result.truncated).toBe('boolean');
    });

    it('recall with empty store returns empty capsules', async () => {
      const { contract } = createContract();
      const result = await contract.recall('anything');
      expect(result.capsules).toEqual([]);
      expect(result.truncated).toBe(false);
    });

    it('store returns StoreReceipt shape', async () => {
      const { contract } = createContract();
      const receipt = await contract.store({
        type: 'observation',
        subject: 'test',
        content: 'data',
      });
      expect(receipt).toHaveProperty('id');
      expect(receipt).toHaveProperty('timestamp');
      expect(typeof receipt.id).toBe('string');
      expect(typeof receipt.timestamp).toBe('string');
    });

    it('forget does not throw', async () => {
      const { contract } = createContract();
      await expect(contract.forget('anything')).resolves.not.toThrow();
    });

    it('consolidate returns ConsolidateStats shape', async () => {
      const { contract } = createContract();
      const stats = await contract.consolidate({ type: 'session_end' });
      expect(stats).toHaveProperty('pruned');
      expect(stats).toHaveProperty('promoted');
      expect(typeof stats.pruned).toBe('number');
      expect(typeof stats.promoted).toBe('number');
    });

    it('consolidate accepts all trigger types', async () => {
      const { contract } = createContract();
      await expect(contract.consolidate({ type: 'session_end' })).resolves.toBeDefined();
      await expect(contract.consolidate({ type: 'pressure' })).resolves.toBeDefined();
      await expect(contract.consolidate({ type: 'scheduled' })).resolves.toBeDefined();
    });

    it('metadata has memory-specific fields', () => {
      const { metadata } = createContract();
      expect(typeof metadata.persistence).toBe('boolean');
      expect(['private', 'shared', 'inherited']).toContain(metadata.scope);
      expect(typeof metadata.consolidation).toBe('boolean');
    });

    it('intent includes memory', () => {
      const { metadata } = createContract();
      expect(metadata.intent.some((i: string) => i.includes('memory'))).toBe(true);
    });

    it('exposes consolidate as systemMethod', () => {
      const pkg = createContract();
      expect(pkg.systemMethods).toBeDefined();
      expect(typeof pkg.systemMethods.consolidate).toBe('function');
    });
  });
}

// --- NullMemory-specific ---

function runNullMemoryTests(
  createContract: () => { contract: MemoryContract; tools: any[]; metadata: any },
) {
  describe('MemoryContract: null-memory (NullMemory-specific)', () => {
    it('tools array is empty', () => {
      const { tools } = createContract();
      expect(tools).toEqual([]);
    });

    it('persistence is false', () => {
      const { metadata } = createContract();
      expect(metadata.persistence).toBe(false);
    });

    it('consolidation is false', () => {
      const { metadata } = createContract();
      expect(metadata.consolidation).toBe(false);
    });

    it('store is a no-op (returns null id)', async () => {
      const { contract } = createContract();
      const receipt = await contract.store({
        type: 'observation',
        subject: 'test',
        content: 'data',
      });
      expect(receipt.id).toBe('null');
    });
  });
}

// --- Active strategies: store-then-recall roundtrip ---

function runActiveStrategyTests(
  name: string,
  createContract: () => { contract: MemoryContract },
) {
  describe(`MemoryContract: ${name} (active strategy)`, () => {
    it('store then recall roundtrip works', async () => {
      const { contract } = createContract();
      await contract.store({
        type: 'observation',
        subject: 'user-preference',
        content: 'prefers dark mode',
      });
      const result = await contract.recall('user-preference');
      expect(result.capsules.length).toBeGreaterThan(0);
    });

    it('forget then recall returns empty', async () => {
      const { contract } = createContract();
      await contract.store({
        type: 'observation',
        subject: 'temporary',
        content: 'should be forgotten',
      });
      await contract.forget('temporary');
      const result = await contract.recall('temporary');
      expect(result.capsules.length).toBe(0);
    });

    it('store with OperationMeta applies tags', async () => {
      const { contract } = createContract();
      await contract.store(
        { type: 'observation', subject: 'tagged', content: 'data' },
        { tags: ['important', 'test'] },
      );
      const result = await contract.recall('tagged');
      expect(result.capsules[0].tags).toContain('important');
    });
  });
}

// ---------------------------------------------------------------------------
// Run against all three strategies
// ---------------------------------------------------------------------------

runMemoryContractTests('null-memory', () => createNullMemoryPackage());
runNullMemoryTests(() => createNullMemoryPackage());

runMemoryContractTests('keyword-memory', () =>
  createKeywordMemoryPackage({ filePath: tmpMemoryPath() }),
);
runActiveStrategyTests('keyword-memory', () =>
  createKeywordMemoryPackage({ filePath: tmpMemoryPath() }),
);

runMemoryContractTests('embedding-memory', () =>
  createEmbeddingMemoryPackage({ filePath: tmpMemoryPath(), embed: mockEmbed() }),
);
runActiveStrategyTests('embedding-memory', () =>
  createEmbeddingMemoryPackage({ filePath: tmpMemoryPath(), embed: mockEmbed() }),
);
