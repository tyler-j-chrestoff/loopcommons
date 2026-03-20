/**
 * orchestrator-memory.test.ts — mc-08 and mc-09
 *
 * mc-08: Orchestrator calls consolidate(session_end) on memory packages
 * mc-09: Orchestrator validates memory package presence
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the agent loop
vi.mock('../src/agent/loop', () => ({
  agent: vi.fn(async (opts: any) => ({
    message: 'Mock response',
    messages: [{ role: 'assistant', content: 'Mock response' }],
    toolResults: [],
    usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
    cost: 0.001,
    rounds: 1,
    model: opts.model ?? 'claude-haiku-4-5',
    provider: 'anthropic',
    trace: {
      id: 'mock-trace',
      startedAt: Date.now(),
      completedAt: Date.now(),
      model: opts.model ?? 'claude-haiku-4-5',
      provider: 'anthropic',
      config: { maxRounds: 5 },
      rounds: [],
      totalUsage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
      totalCost: 0.001,
      status: 'completed',
    },
  })),
}));

import { createOrchestrator } from '../src/orchestrator';
import { createToolRegistry, defineTool } from '../src/tool';
import type { ToolPackage } from '../src/tool';
import { z } from 'zod';
import type { AmygdalaResult } from '../src/amygdala/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAmygdalaResult(overrides: Partial<AmygdalaResult> = {}): AmygdalaResult {
  return {
    intent: 'conversation',
    confidence: 0.9,
    rewrittenPrompt: 'Hello',
    modified: false,
    threat: { score: 0.05, category: 'none', reasoning: 'Safe' },
    contextDelegation: {
      historyIndices: [],
      annotations: [],
    },
    ...overrides,
  };
}

function makeMemoryPackage(overrides: {
  consolidation?: boolean;
  persistence?: boolean;
  consolidateFn?: () => Promise<any>;
} = {}): ToolPackage {
  const consolidateFn = overrides.consolidateFn ?? vi.fn(async () => ({ pruned: 0, promoted: 0 }));
  return {
    tools: [
      defineTool({
        name: 'memory_recall',
        description: 'Recall memories',
        parameters: z.object({}),
        execute: async () => '[]',
      }),
      defineTool({
        name: 'memory_remember',
        description: 'Store memories',
        parameters: z.object({}),
        execute: async () => '{}',
      }),
    ],
    formatContext: () => '',
    metadata: {
      name: 'test-memory',
      capabilities: ['recall', 'remember'],
      intent: ['memory'],
      sideEffects: true,
      persistence: overrides.persistence ?? true,
      scope: 'private' as const,
      consolidation: overrides.consolidation ?? true,
    },
    systemMethods: {
      consolidate: consolidateFn,
    },
  };
}

function makeNonMemoryPackage(): ToolPackage {
  return {
    tools: [
      defineTool({
        name: 'get_resume',
        description: 'Get resume',
        parameters: z.object({}),
        execute: async () => '{}',
      }),
    ],
    formatContext: () => '',
    metadata: {
      name: 'resume',
      capabilities: ['resume'],
      intent: ['resume'],
      sideEffects: false,
    },
  };
}

const toolRegistry = createToolRegistry([
  defineTool({
    name: 'memory_recall',
    description: 'Recall',
    parameters: z.object({}),
    execute: async () => '[]',
  }),
  defineTool({
    name: 'memory_remember',
    description: 'Remember',
    parameters: z.object({}),
    execute: async () => '{}',
  }),
  defineTool({
    name: 'get_resume',
    description: 'Resume',
    parameters: z.object({}),
    execute: async () => '{}',
  }),
]);

// ---------------------------------------------------------------------------
// mc-09: Memory package validation
// ---------------------------------------------------------------------------

describe('mc-09: memory package validation', () => {
  it('throws when toolPackages has no memory package', async () => {
    const orchestrate = createOrchestrator();
    await expect(
      orchestrate({
        amygdalaResult: makeAmygdalaResult(),
        conversationHistory: [],
        toolRegistry,
        toolPackages: [makeNonMemoryPackage()],
      }),
    ).rejects.toThrow(/memory/i);
  });

  it('does not throw when toolPackages includes a memory package', async () => {
    const orchestrate = createOrchestrator();
    await expect(
      orchestrate({
        amygdalaResult: makeAmygdalaResult(),
        conversationHistory: [],
        toolRegistry,
        toolPackages: [makeNonMemoryPackage(), makeMemoryPackage()],
      }),
    ).resolves.toBeDefined();
  });

  it('does not throw when toolPackages is undefined (backward compat)', async () => {
    const orchestrate = createOrchestrator();
    await expect(
      orchestrate({
        amygdalaResult: makeAmygdalaResult(),
        conversationHistory: [],
        toolRegistry,
      }),
    ).resolves.toBeDefined();
  });

  it('accepts NullMemory (intent includes memory, tools empty)', async () => {
    const nullMemory: ToolPackage = {
      tools: [],
      formatContext: () => '',
      metadata: {
        name: 'null-memory',
        capabilities: [],
        intent: ['memory'],
        sideEffects: false,
        persistence: false,
        scope: 'private' as const,
        consolidation: false,
      },
      systemMethods: {
        consolidate: async () => ({ pruned: 0, promoted: 0 }),
      },
    };
    const orchestrate = createOrchestrator();
    await expect(
      orchestrate({
        amygdalaResult: makeAmygdalaResult(),
        conversationHistory: [],
        toolRegistry,
        toolPackages: [nullMemory],
      }),
    ).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// mc-08: Consolidation lifecycle
// ---------------------------------------------------------------------------

describe('mc-08: consolidation lifecycle', () => {
  it('calls consolidate on memory package after interaction', async () => {
    const consolidateFn = vi.fn(async () => ({ pruned: 0, promoted: 0 }));
    const memPkg = makeMemoryPackage({ consolidation: true, consolidateFn });
    const orchestrate = createOrchestrator();

    await orchestrate({
      amygdalaResult: makeAmygdalaResult(),
      conversationHistory: [],
      toolRegistry,
      toolPackages: [memPkg],
    });

    expect(consolidateFn).toHaveBeenCalledTimes(1);
    expect(consolidateFn).toHaveBeenCalledWith({ type: 'session_end' });
  });

  it('skips consolidation when consolidation metadata is false', async () => {
    const consolidateFn = vi.fn(async () => ({ pruned: 0, promoted: 0 }));
    const memPkg = makeMemoryPackage({ consolidation: false, consolidateFn });
    const orchestrate = createOrchestrator();

    await orchestrate({
      amygdalaResult: makeAmygdalaResult(),
      conversationHistory: [],
      toolRegistry,
      toolPackages: [memPkg],
    });

    expect(consolidateFn).not.toHaveBeenCalled();
  });

  it('skips consolidation when no systemMethods', async () => {
    const memPkg: ToolPackage = {
      tools: [
        defineTool({
          name: 'memory_recall',
          description: 'Recall',
          parameters: z.object({}),
          execute: async () => '[]',
        }),
      ],
      formatContext: () => '',
      metadata: {
        name: 'test-memory',
        capabilities: ['recall'],
        intent: ['memory'],
        sideEffects: true,
        persistence: true,
        scope: 'private' as const,
        consolidation: true,
      },
      // No systemMethods
    };
    const orchestrate = createOrchestrator();

    // Should not throw even though consolidation:true but no systemMethods
    await expect(
      orchestrate({
        amygdalaResult: makeAmygdalaResult(),
        conversationHistory: [],
        toolRegistry,
        toolPackages: [memPkg],
      }),
    ).resolves.toBeDefined();
  });

  it('does not consolidate on refusal route', async () => {
    const consolidateFn = vi.fn(async () => ({ pruned: 0, promoted: 0 }));
    const memPkg = makeMemoryPackage({ consolidation: true, consolidateFn });
    const orchestrate = createOrchestrator();

    await orchestrate({
      amygdalaResult: makeAmygdalaResult({
        intent: 'adversarial',
        threat: { score: 0.9, category: 'social_engineering', reasoning: 'Attack' },
      }),
      conversationHistory: [],
      toolRegistry,
      toolPackages: [memPkg],
    });

    // Refusal = adversarial. No consolidation for adversarial interactions.
    expect(consolidateFn).not.toHaveBeenCalled();
  });
});
