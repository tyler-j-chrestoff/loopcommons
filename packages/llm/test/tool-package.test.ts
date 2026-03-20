import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { defineTool } from '../src/tool';
import type { ToolPackage } from '../src/tool';
import { createKeywordMemoryPackage } from '@loopcommons/memory/keyword';
import { createEmbeddingMemoryPackage } from '@loopcommons/memory/embedding';

/**
 * Contract tests for ToolPackage interface.
 * Any object satisfying ToolPackage must pass these tests.
 * Used to verify all ToolPackage implementations (keyword, embedding, etc.).
 */
export function runToolPackageContractTests(
  name: string,
  createPackage: () => ToolPackage,
) {
  describe(`ToolPackage contract: ${name}`, () => {
    it('has a non-empty name in metadata', () => {
      const pkg = createPackage();
      expect(pkg.metadata.name).toBeTruthy();
      expect(typeof pkg.metadata.name).toBe('string');
    });

    it('has a capabilities array in metadata', () => {
      const pkg = createPackage();
      expect(Array.isArray(pkg.metadata.capabilities)).toBe(true);
      expect(pkg.metadata.capabilities.length).toBeGreaterThan(0);
    });

    it('has an intent array in metadata', () => {
      const pkg = createPackage();
      expect(Array.isArray(pkg.metadata.intent)).toBe(true);
      expect(pkg.metadata.intent.length).toBeGreaterThan(0);
      for (const i of pkg.metadata.intent) {
        expect(typeof i).toBe('string');
      }
    });

    it('has a sideEffects boolean in metadata', () => {
      const pkg = createPackage();
      expect(typeof pkg.metadata.sideEffects).toBe('boolean');
    });

    it('exposes at least one tool', () => {
      const pkg = createPackage();
      expect(pkg.tools.length).toBeGreaterThan(0);
    });

    it('each tool has name, description, parameters, and execute', () => {
      const pkg = createPackage();
      for (const tool of pkg.tools) {
        expect(typeof tool.name).toBe('string');
        expect(tool.name.length).toBeGreaterThan(0);
        expect(typeof tool.description).toBe('string');
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.execute).toBe('function');
      }
    });

    it('tool names are unique within the package', () => {
      const pkg = createPackage();
      const names = pkg.tools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });

    it('formatContext returns a string', () => {
      const pkg = createPackage();
      const ctx = pkg.formatContext();
      expect(typeof ctx).toBe('string');
    });
  });
}

// --- Run contract tests against a minimal stub to prove the contract works ---

function createStubPackage(): ToolPackage {
  return {
    tools: [
      defineTool({
        name: 'stub_tool',
        description: 'A stub tool for testing',
        parameters: z.object({ query: z.string() }),
        execute: async () => 'stub result',
      }),
    ],
    formatContext: () => 'stub context',
    metadata: {
      name: 'stub-package',
      capabilities: ['testing'],
      intent: ['testing'],
      sideEffects: false,
    },
  };
}

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pkg-contract-'));
  return path.join(dir, 'test-memory.json');
}

describe('ToolPackage', () => {
  runToolPackageContractTests('stub', createStubPackage);

  runToolPackageContractTests('keyword-memory', () =>
    createKeywordMemoryPackage({ filePath: tmpMemoryPath() }),
  );

  runToolPackageContractTests('embedding-memory', () =>
    createEmbeddingMemoryPackage({
      filePath: tmpMemoryPath(),
      embed: async (text) => {
        const codes = text.split('').slice(0, 4).map((c) => c.charCodeAt(0) / 200);
        while (codes.length < 4) codes.push(0);
        return codes;
      },
    }),
  );

  it('accepts optional cost in metadata', () => {
    const pkg: ToolPackage = {
      tools: [
        defineTool({
          name: 'test',
          description: 'test',
          parameters: z.object({}),
          execute: async () => '',
        }),
      ],
      formatContext: () => '',
      metadata: {
        name: 'test-pkg',
        capabilities: ['test'],
        intent: ['test'],
        sideEffects: false,
        cost: '$0.02/1M tokens',
      },
    };
    expect(pkg.metadata.cost).toBe('$0.02/1M tokens');
  });

  it('accepts optional authRequired in metadata', () => {
    const pkg: ToolPackage = {
      tools: [
        defineTool({
          name: 'test',
          description: 'test',
          parameters: z.object({}),
          execute: async () => '',
        }),
      ],
      formatContext: () => '',
      metadata: {
        name: 'test-pkg',
        capabilities: ['test'],
        intent: ['test'],
        sideEffects: true,
        authRequired: true,
      },
    };
    expect(pkg.metadata.authRequired).toBe(true);
  });

  it('accepts optional systemMethods record', () => {
    const consolidateFn = async () => ({ pruned: 0, promoted: 0 });
    const pkg: ToolPackage = {
      tools: [
        defineTool({
          name: 'test',
          description: 'test',
          parameters: z.object({}),
          execute: async () => '',
        }),
      ],
      formatContext: () => '',
      metadata: {
        name: 'test-pkg',
        capabilities: ['test'],
        intent: ['test'],
        sideEffects: false,
      },
      systemMethods: {
        consolidate: consolidateFn,
      },
    };
    expect(pkg.systemMethods).toBeDefined();
    expect(typeof pkg.systemMethods!.consolidate).toBe('function');
  });

  it('systemMethods are not required (backward compatible)', () => {
    const pkg: ToolPackage = {
      tools: [],
      formatContext: () => '',
      metadata: {
        name: 'test-pkg',
        capabilities: [],
        intent: ['test'],
        sideEffects: false,
      },
    };
    expect(pkg.systemMethods).toBeUndefined();
  });

  it('systemMethods are excluded from tool list', () => {
    const consolidateFn = async () => ({ pruned: 0, promoted: 0 });
    const pkg: ToolPackage = {
      tools: [
        defineTool({
          name: 'memory_recall',
          description: 'recall',
          parameters: z.object({}),
          execute: async () => '',
        }),
      ],
      formatContext: () => '',
      metadata: {
        name: 'memory-pkg',
        capabilities: ['recall'],
        intent: ['memory'],
        sideEffects: false,
      },
      systemMethods: {
        consolidate: consolidateFn,
      },
    };
    // consolidate should NOT appear in tools array
    const toolNames = pkg.tools.map(t => t.name);
    expect(toolNames).not.toContain('consolidate');
    // but should be available via systemMethods
    expect(pkg.systemMethods!.consolidate).toBeDefined();
  });
});
