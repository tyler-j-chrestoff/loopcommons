import { describe, it, expect } from 'vitest';
import { createRouter } from '../index';
import { createWebAdapter } from '../adapters/web';
import { createSimpleLedger } from '../../ledger/simple-ledger';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';

function createStubCore(response = 'Hello!'): AgentCore {
  return {
    async invoke(_invocation: AgentInvocation): Promise<AgentInvocationResult> {
      return {
        response,
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        amygdalaUsage: { inputTokens: 50, outputTokens: 20 },
        amygdalaCost: 0.0003,
      };
    },
  };
}

describe('Router with Ledger', () => {
  it('produces receipts when ledger is provided', async () => {
    const ledger = createSimpleLedger();
    await ledger.fund('router', 1000, 'initial');

    const router = createRouter({
      adapters: [createWebAdapter()],
      core: createStubCore(),
      ledger,
    });

    const output = await router.process({
      raw: { message: 'Hi', userId: 'u1', isAdmin: false, isAuthenticated: true },
      channelType: 'web',
    });

    expect(output.response.receipts).toBeDefined();
    expect(output.response.receipts!.length).toBeGreaterThan(0);
    expect(output.response.receipts![0].subsystemId).toBe('router');
    expect(output.response.receipts![0].purpose).toContain('normalize');
  });

  it('works without ledger (backwards compatible)', async () => {
    const router = createRouter({
      adapters: [createWebAdapter()],
      core: createStubCore(),
    });

    const output = await router.process({
      raw: { message: 'Hi', userId: 'u1', isAdmin: false, isAuthenticated: true },
      channelType: 'web',
    });

    expect(output.response.receipts).toBeUndefined();
  });

  it('deducts energy from ledger account', async () => {
    const ledger = createSimpleLedger();
    await ledger.fund('router', 1000, 'initial');

    const router = createRouter({
      adapters: [createWebAdapter()],
      core: createStubCore(),
      ledger,
    });

    await router.process({
      raw: { message: 'Hi', userId: 'u1', isAdmin: false, isAuthenticated: true },
      channelType: 'web',
    });

    const bal = await ledger.balance('router');
    expect(bal.total).toBeLessThan(1000);
  });
});
