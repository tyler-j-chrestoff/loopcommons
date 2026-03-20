import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createKeywordMemoryPackage } from '../src/keyword-package';
import type { ToolPackage } from '@loopcommons/llm';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-kw-'));
  return path.join(dir, 'test-memory.json');
}

describe('createKeywordMemoryPackage', () => {
  let filePath: string;

  beforeEach(() => {
    filePath = tmpMemoryPath();
  });

  it('returns an object satisfying ToolPackage', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    // Structural check — same fields as ToolPackage
    expect(pkg.tools).toBeDefined();
    expect(pkg.formatContext).toBeDefined();
    expect(pkg.metadata).toBeDefined();
    expect(pkg.metadata.name).toBe('keyword-memory');
    expect(pkg.metadata.capabilities).toContain('recall');
    expect(pkg.metadata.capabilities).toContain('remember');
  });

  it('is assignable to ToolPackage type', () => {
    // TypeScript structural compatibility: this compiles only if the shape matches
    const pkg: ToolPackage = createKeywordMemoryPackage({ filePath });
    expect(pkg.tools.length).toBe(2);
  });

  it('exposes memory_recall and memory_remember tools', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    const names = pkg.tools.map(t => t.name);
    expect(names).toContain('memory_recall');
    expect(names).toContain('memory_remember');
  });

  it('formatContext returns empty string when no memories', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    expect(pkg.formatContext()).toBe('');
  });

  it('formatContext returns context after recall', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    // Store a memory via PersistentState
    await pkg.state.remember({
      type: 'observation',
      subject: 'test-user',
      content: 'User is a developer',
    });

    // Recall populates the formatContext cache
    await pkg.state.recall({ limit: 10 });

    const ctx = pkg.formatContext();
    expect(ctx).toContain('Agent memories');
    expect(ctx).toContain('developer');
  });

  it('accepts getThreatScore for tool-level gating', async () => {
    const pkg = createKeywordMemoryPackage({
      filePath,
      getThreatScore: () => 0.8,
    });
    const rememberTool = pkg.tools.find(t => t.name === 'memory_remember')!;
    const result = await rememberTool.execute({
      type: 'observation',
      subject: 'test',
      content: 'should be blocked',
    });
    expect(JSON.parse(result).error).toContain('blocked');
  });

  it('exposes state for direct programmatic access', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    expect(pkg.state).toBeDefined();
    expect(typeof pkg.state.recall).toBe('function');
    expect(typeof pkg.state.remember).toBe('function');
    expect(typeof pkg.state.stats).toBe('function');
  });

  // --- Memory contract conformance ---

  it('exposes a MemoryContract via contract property', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    expect(pkg.contract).toBeDefined();
    expect(typeof pkg.contract.recall).toBe('function');
    expect(typeof pkg.contract.store).toBe('function');
    expect(typeof pkg.contract.forget).toBe('function');
    expect(typeof pkg.contract.consolidate).toBe('function');
  });

  it('contract.recall returns RecallResult with capsules and truncated', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    const result = await pkg.contract.recall('anything');
    expect(result).toHaveProperty('capsules');
    expect(result).toHaveProperty('truncated');
    expect(Array.isArray(result.capsules)).toBe(true);
    expect(typeof result.truncated).toBe('boolean');
  });

  it('contract.store returns StoreReceipt', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    const receipt = await pkg.contract.store({
      type: 'observation',
      subject: 'test',
      content: 'data',
    });
    expect(receipt).toHaveProperty('id');
    expect(receipt).toHaveProperty('timestamp');
    expect(typeof receipt.id).toBe('string');
  });

  it('contract.recall finds what contract.store stored', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    await pkg.contract.store({
      type: 'observation',
      subject: 'favorite-color',
      content: 'blue',
    });
    const result = await pkg.contract.recall('favorite-color');
    expect(result.capsules.length).toBeGreaterThan(0);
    expect(result.capsules[0].type).toBe('observation');
  });

  it('contract.recall respects limit option', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    for (let i = 0; i < 5; i++) {
      await pkg.contract.store({
        type: 'observation',
        subject: `item-${i}`,
        content: `data about item ${i}`,
      });
    }
    const result = await pkg.contract.recall('item', { limit: 2 });
    expect(result.capsules.length).toBe(2);
    expect(result.truncated).toBe(true);
  });

  it('contract.forget removes matching entries', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    await pkg.contract.store({
      type: 'observation',
      subject: 'secret',
      content: 'should be forgotten',
    });
    await pkg.contract.forget('secret');
    const result = await pkg.contract.recall('secret');
    expect(result.capsules.length).toBe(0);
  });

  it('contract.consolidate returns stats', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    const stats = await pkg.contract.consolidate({ type: 'session_end' });
    expect(stats).toHaveProperty('pruned');
    expect(stats).toHaveProperty('promoted');
    expect(typeof stats.pruned).toBe('number');
    expect(typeof stats.promoted).toBe('number');
  });

  it('has memory metadata fields', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    expect(pkg.metadata.persistence).toBe(true);
    expect(pkg.metadata.scope).toBe('private');
    expect(pkg.metadata.consolidation).toBe(true);
  });

  it('exposes consolidate as systemMethod', () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    expect(pkg.systemMethods).toBeDefined();
    expect(typeof pkg.systemMethods!.consolidate).toBe('function');
  });

  it('contract.store respects OperationMeta', async () => {
    const pkg = createKeywordMemoryPackage({ filePath });
    const receipt = await pkg.contract.store(
      { type: 'observation', subject: 'test', content: 'data' },
      { priority: 0.9, tags: ['important'], uncertainty: 0.1 },
    );
    expect(receipt.id).toBeDefined();
    // Verify the meta was applied by recalling
    const result = await pkg.contract.recall('test');
    const stored = result.capsules[0];
    expect(stored.tags).toContain('important');
    expect(stored.uncertainty).toBe(0.1);
  });
});
