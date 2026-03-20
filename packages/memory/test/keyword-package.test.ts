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
});
