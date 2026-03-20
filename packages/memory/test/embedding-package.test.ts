import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createEmbeddingMemoryPackage } from '../src/embedding-package';
import type { EmbedFn } from '../src/embedding';
import type { ToolPackage } from '@loopcommons/llm';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-emb-pkg-'));
  return path.join(dir, 'test-memory.json');
}

function mockEmbed(): EmbedFn {
  return vi.fn(async (text: string) => {
    // Deterministic: first 4 char codes normalized
    const codes = text.split('').slice(0, 4).map((c) => c.charCodeAt(0) / 200);
    while (codes.length < 4) codes.push(0);
    return codes;
  });
}

describe('createEmbeddingMemoryPackage', () => {
  let filePath: string;
  let embed: EmbedFn;

  beforeEach(() => {
    filePath = tmpMemoryPath();
    embed = mockEmbed();
  });

  // -- ToolPackage contract --

  it('returns an object satisfying ToolPackage', () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    expect(pkg.tools).toBeDefined();
    expect(pkg.formatContext).toBeDefined();
    expect(pkg.metadata).toBeDefined();
    expect(pkg.metadata.name).toBe('embedding-memory');
    expect(pkg.metadata.capabilities).toContain('recall');
    expect(pkg.metadata.capabilities).toContain('remember');
    expect(pkg.metadata.capabilities).toContain('semantic-search');
  });

  it('is assignable to ToolPackage type', () => {
    const pkg: ToolPackage = createEmbeddingMemoryPackage({ filePath, embed });
    expect(pkg.tools.length).toBe(2);
  });

  it('exposes memory_recall and memory_remember tools', () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    const names = pkg.tools.map((t) => t.name);
    expect(names).toContain('memory_recall');
    expect(names).toContain('memory_remember');
  });

  it('formatContext returns empty string when no memories', () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    expect(pkg.formatContext()).toBe('');
  });

  it('formatContext returns context after recall', async () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    await pkg.state.remember({
      type: 'observation',
      subject: 'test-user',
      content: 'User is a developer',
    });

    await pkg.state.recall({ limit: 10 });
    const ctx = pkg.formatContext();
    expect(ctx).toContain('Agent memories');
    expect(ctx).toContain('developer');
  });

  it('accepts getThreatScore for tool-level gating', async () => {
    const pkg = createEmbeddingMemoryPackage({
      filePath,
      embed,
      getThreatScore: () => 0.8,
    });
    const rememberTool = pkg.tools.find((t) => t.name === 'memory_remember')!;
    const result = await rememberTool.execute({
      type: 'observation',
      subject: 'test',
      content: 'should be blocked',
    });
    expect(JSON.parse(result).error).toContain('blocked');
  });

  it('exposes state for direct programmatic access', () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    expect(pkg.state).toBeDefined();
    expect(typeof pkg.state.recall).toBe('function');
    expect(typeof pkg.state.remember).toBe('function');
    expect(typeof pkg.state.stats).toBe('function');
  });

  // -- Embedding-specific --

  it('remember stores vector via embedding', async () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    const memory = await pkg.state.remember({
      type: 'observation',
      subject: 'user',
      content: 'likes hiking',
    });
    expect(memory.vector).toBeDefined();
    expect(memory.vector!.length).toBeGreaterThan(0);
  });

  it('recall with semantic query ranks by blended similarity', async () => {
    const embedMap: Record<string, number[]> = {
      'user enjoys hiking': [1, 0, 0, 0],
      'user2 likes swimming': [0, 1, 0, 0],
      'hiking outdoors': [0.9, 0.1, 0, 0],
    };
    const smartEmbed: EmbedFn = async (text) => embedMap[text] ?? [0, 0, 0, 0];

    const pkg = createEmbeddingMemoryPackage({ filePath, embed: smartEmbed });
    await pkg.state.remember({ type: 'observation', subject: 'user', content: 'enjoys hiking' });
    await pkg.state.remember({ type: 'observation', subject: 'user2', content: 'likes swimming' });

    const results = await pkg.state.recall({ limit: 10 }, 'hiking outdoors');
    expect((results[0] as any).subject).toBe('user');
  });

  it('reports cost in metadata', () => {
    const pkg = createEmbeddingMemoryPackage({ filePath, embed });
    expect(pkg.metadata.cost).toBeDefined();
  });

  // -- Swappability proof --

  it('keyword and embedding packages both satisfy ToolPackage', async () => {
    const { createKeywordMemoryPackage } = await import('../src/keyword-package');
    const a: ToolPackage = createKeywordMemoryPackage({ filePath: tmpMemoryPath() });
    const b: ToolPackage = createEmbeddingMemoryPackage({ filePath: tmpMemoryPath(), embed });

    // Same tool names
    expect(a.tools.map((t: any) => t.name).sort()).toEqual(b.tools.map((t) => t.name).sort());
    // Both have formatContext
    expect(typeof a.formatContext).toBe('function');
    expect(typeof b.formatContext).toBe('function');
  });
});
