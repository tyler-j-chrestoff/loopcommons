import { describe, it, expect } from 'vitest';
import { createNullMemoryPackage } from '../src/null-package';
import type { ToolPackage } from '@loopcommons/llm';
import type { MemoryContract } from '../src/contract';

describe('NullMemory', () => {
  it('is assignable to ToolPackage', () => {
    const pkg: ToolPackage = createNullMemoryPackage();
    expect(pkg).toBeDefined();
  });

  it('has empty tools array', () => {
    const pkg = createNullMemoryPackage();
    expect(pkg.tools).toEqual([]);
  });

  it('has populated metadata', () => {
    const pkg = createNullMemoryPackage();
    expect(pkg.metadata.name).toBe('null-memory');
    expect(pkg.metadata.persistence).toBe(false);
    expect(pkg.metadata.scope).toBe('private');
    expect(pkg.metadata.consolidation).toBe(false);
    expect(pkg.metadata.sideEffects).toBe(false);
    expect(pkg.metadata.intent).toContain('memory');
  });

  it('formatContext returns empty string', () => {
    const pkg = createNullMemoryPackage();
    expect(pkg.formatContext()).toBe('');
  });

  it('exposes a MemoryContract via contract property', () => {
    const pkg = createNullMemoryPackage();
    expect(pkg.contract).toBeDefined();
    expect(typeof pkg.contract.recall).toBe('function');
    expect(typeof pkg.contract.store).toBe('function');
    expect(typeof pkg.contract.forget).toBe('function');
    expect(typeof pkg.contract.consolidate).toBe('function');
  });

  it('recall returns empty capsules and truncated=false', async () => {
    const pkg = createNullMemoryPackage();
    const result = await pkg.contract.recall('anything');
    expect(result.capsules).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('store returns a receipt with id and timestamp', async () => {
    const pkg = createNullMemoryPackage();
    const receipt = await pkg.contract.store({
      type: 'observation',
      subject: 'test',
      content: 'data',
    });
    expect(receipt.id).toBe('null');
    expect(typeof receipt.timestamp).toBe('string');
  });

  it('forget is a no-op', async () => {
    const pkg = createNullMemoryPackage();
    await expect(pkg.contract.forget('anything')).resolves.toBeUndefined();
  });

  it('consolidate returns zero stats', async () => {
    const pkg = createNullMemoryPackage();
    const stats = await pkg.contract.consolidate({ type: 'session_end' });
    expect(stats.pruned).toBe(0);
    expect(stats.promoted).toBe(0);
  });

  it('exposes consolidate as a systemMethod', () => {
    const pkg = createNullMemoryPackage();
    expect(pkg.systemMethods).toBeDefined();
    expect(typeof pkg.systemMethods!.consolidate).toBe('function');
  });
});
