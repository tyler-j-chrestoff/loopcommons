/**
 * Agent core — invocation contract types and createAgentCore factory.
 *
 * TDD: types + factory signature first, then pipeline extraction.
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  AgentInvocation,
  AgentInvocationResult,
  AgentCoreConfig,
  AgentCoreFn,
} from '../src/core/types';
import { createAgentCore } from '../src/core';
import type { AmygdalaResult, AmygdalaFn } from '../src/amygdala/types';
import type { OrchestratorFn, OrchestratorResult } from '../src/orchestrator/types';
import type { ToolPackage } from '../src/tool';
import type { TraceEvent } from '../src/trace/events';

// ---------------------------------------------------------------------------
// Type-level contract tests — verify the invocation shape compiles correctly
// ---------------------------------------------------------------------------

describe('AgentInvocation contract', () => {
  it('requires message, conversationHistory, and identity', () => {
    const invocation: AgentInvocation = {
      message: 'hello',
      conversationHistory: [],
      identity: {
        interfaceId: 'web',
        isAdmin: false,
        isAuthenticated: true,
      },
    };
    expect(invocation.message).toBe('hello');
    expect(invocation.identity.interfaceId).toBe('web');
    expect(invocation.identity.isAdmin).toBe(false);
    expect(invocation.identity.isAuthenticated).toBe(true);
  });

  it('accepts optional stream flag (defaults conceptually to true)', () => {
    const invocation: AgentInvocation = {
      message: 'hello',
      conversationHistory: [],
      identity: { interfaceId: 'cli', isAdmin: true, isAuthenticated: true },
      stream: false,
    };
    expect(invocation.stream).toBe(false);
  });

  it('accepts optional userId', () => {
    const invocation: AgentInvocation = {
      message: 'hello',
      conversationHistory: [],
      identity: {
        interfaceId: 'web',
        isAdmin: false,
        isAuthenticated: true,
        userId: 'user-123',
      },
    };
    expect(invocation.identity.userId).toBe('user-123');
  });

  it('accepts optional requestMetadata', () => {
    const invocation: AgentInvocation = {
      message: 'hello',
      conversationHistory: [],
      identity: {
        interfaceId: 'web',
        isAdmin: false,
        isAuthenticated: true,
        requestMetadata: {
          ipHash: 'abc',
          isAuthenticated: true,
          isAdmin: false,
          sessionIndex: 0,
          hourUtc: 14,
        },
      },
    };
    expect(invocation.identity.requestMetadata?.ipHash).toBe('abc');
  });
});

describe('AgentInvocationResult contract', () => {
  it('has response, traceEvents, usage, and cost', () => {
    const result: AgentInvocationResult = {
      response: 'Hi there!',
      traceEvents: [],
      usage: { inputTokens: 100, outputTokens: 50 },
      cost: 0.001,
      subagentId: 'conversational',
      subagentName: 'Conversational',
      amygdalaUsage: { inputTokens: 40, outputTokens: 10 },
      amygdalaCost: 0.0003,
    };
    expect(result.response).toBe('Hi there!');
    expect(result.usage.inputTokens).toBe(100);
    expect(result.cost).toBe(0.001);
    expect(result.subagentId).toBe('conversational');
  });
});

// ---------------------------------------------------------------------------
// Helpers — mock amygdala and orchestrator
// ---------------------------------------------------------------------------

function createMockAmygdalaResult(overrides: Partial<AmygdalaResult> = {}): AmygdalaResult {
  return {
    rewrittenPrompt: 'hello',
    intent: 'conversation',
    threat: { score: 0.1, category: 'none', reasoning: 'friendly greeting' },
    contextDelegation: { historyIndices: [], annotations: [] },
    traceEvents: [
      { type: 'amygdala:classify', intent: 'conversation', confidence: 0.9, timestamp: Date.now() },
    ],
    latencyMs: 50,
    usage: { inputTokens: 200, outputTokens: 30, cachedTokens: 100 },
    cost: 0.0001,
    ...overrides,
  };
}

function createMockAmygdala(result: AmygdalaResult = createMockAmygdalaResult()): AmygdalaFn {
  return vi.fn().mockResolvedValue(result);
}

function createMockOrchestratorResult(overrides: Partial<OrchestratorResult> = {}): OrchestratorResult {
  return {
    agentResult: {
      message: 'Hi there!',
      messages: [{ role: 'assistant', content: 'Hi there!' }],
      toolResults: [],
      usage: { inputTokens: 300, outputTokens: 80, cachedTokens: 50 },
      cost: 0.0005,
      rounds: 1,
      model: 'claude-haiku-4-5',
      provider: 'anthropic',
      trace: {
        id: 'trace-1',
        startedAt: Date.now(),
        completedAt: Date.now(),
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        config: { maxRounds: 5 },
        rounds: [],
        totalUsage: { inputTokens: 300, outputTokens: 80, cachedTokens: 50 },
        totalCost: 0.0005,
        status: 'completed',
      },
    },
    subagentId: 'conversational',
    subagentName: 'Conversational',
    traceEvents: [],
    ...overrides,
  };
}

function createMockOrchestrator(result: OrchestratorResult = createMockOrchestratorResult()): OrchestratorFn {
  return vi.fn().mockResolvedValue(result);
}

function createMockMemoryPackage(): ToolPackage & { state: { recall: ReturnType<typeof vi.fn> } } {
  const state = {
    recall: vi.fn().mockResolvedValue([]),
  };
  return {
    tools: [],
    formatContext: () => '',
    metadata: {
      name: 'memory',
      capabilities: ['recall', 'remember'],
      intent: ['memory', 'memory-recall', 'memory-remember'],
      sideEffects: true,
      persistence: true,
      scope: 'private' as const,
      consolidation: true,
    },
    state,
  };
}

function createMinimalInvocation(overrides: Partial<AgentInvocation> = {}): AgentInvocation {
  return {
    message: 'hello',
    conversationHistory: [],
    identity: { interfaceId: 'test', isAdmin: false, isAuthenticated: true },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Factory tests
// ---------------------------------------------------------------------------

describe('createAgentCore', () => {
  it('is a function', () => {
    expect(typeof createAgentCore).toBe('function');
  });

  it('returns an object with invoke method', () => {
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(),
      orchestrator: createMockOrchestrator(),
    });
    expect(typeof core.invoke).toBe('function');
  });

  it('does not require session writer, rate limiter, or HTTP dependencies', () => {
    // The core is interface-agnostic — adapters own transport concerns.
    // This test proves the core can be constructed with only agent-level dependencies.
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(),
      orchestrator: createMockOrchestrator(),
    });
    // If this compiles and runs, the core has no hidden HTTP/session/rate-limit deps
    expect(core).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Pipeline tests — mi-02
// ---------------------------------------------------------------------------

describe('invoke pipeline', () => {
  it('calls amygdala with the raw message and conversation history', async () => {
    const amygdala = createMockAmygdala();
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala,
      orchestrator: createMockOrchestrator(),
    });

    await core.invoke(createMinimalInvocation({ message: 'Tell me about Tyler' }));

    expect(amygdala).toHaveBeenCalledOnce();
    const amygdalaInput = (amygdala as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(amygdalaInput.rawMessage).toBe('Tell me about Tyler');
    expect(amygdalaInput.conversationHistory).toEqual([]);
  });

  it('passes requestMetadata from identity to amygdala', async () => {
    const amygdala = createMockAmygdala();
    const metadata = {
      ipHash: 'abc123',
      isAuthenticated: true,
      isAdmin: false,
      sessionIndex: 3,
      hourUtc: 14,
      userAgentHash: 'ua-hash',
    };
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala,
      orchestrator: createMockOrchestrator(),
    });

    await core.invoke(createMinimalInvocation({
      identity: {
        interfaceId: 'web',
        isAdmin: false,
        isAuthenticated: true,
        requestMetadata: metadata,
      },
    }));

    const amygdalaInput = (amygdala as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(amygdalaInput.requestMetadata).toEqual(metadata);
  });

  it('calls orchestrator with amygdala result and toolPackages', async () => {
    const amygdalaResult = createMockAmygdalaResult();
    const orchestrator = createMockOrchestrator();
    const memoryPkg = createMockMemoryPackage();

    const core = createAgentCore({
      toolPackages: [memoryPkg],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator,
    });

    await core.invoke(createMinimalInvocation());

    expect(orchestrator).toHaveBeenCalledOnce();
    const orchInput = (orchestrator as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orchInput.amygdalaResult).toEqual(amygdalaResult);
    expect(orchInput.toolPackages).toEqual([memoryPkg]);
    expect(orchInput.isAdmin).toBe(false);
  });

  it('returns aggregated response, usage, and cost', async () => {
    const amygdalaResult = createMockAmygdalaResult({
      usage: { inputTokens: 200, outputTokens: 30, cachedTokens: 0 },
      cost: 0.0001,
    });
    const orchResult = createMockOrchestratorResult({
      agentResult: {
        message: 'Hello!',
        messages: [{ role: 'assistant', content: 'Hello!' }],
        toolResults: [],
        usage: { inputTokens: 300, outputTokens: 80, cachedTokens: 0 },
        cost: 0.0005,
        rounds: 1,
        model: 'claude-haiku-4-5',
        provider: 'anthropic',
        trace: {
          id: 'trace-1',
          startedAt: Date.now(),
          completedAt: Date.now(),
          model: 'claude-haiku-4-5',
          provider: 'anthropic',
          config: { maxRounds: 5 },
          rounds: [],
          totalUsage: { inputTokens: 300, outputTokens: 80, cachedTokens: 0 },
          totalCost: 0.0005,
          status: 'completed',
        },
      },
    });

    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator: createMockOrchestrator(orchResult),
    });

    const result = await core.invoke(createMinimalInvocation());

    expect(result.response).toBe('Hello!');
    // Aggregate usage = amygdala + subagent
    expect(result.usage.inputTokens).toBe(500);
    expect(result.usage.outputTokens).toBe(110);
    // Aggregate cost
    expect(result.cost).toBeCloseTo(0.0006, 10);
    expect(result.subagentId).toBe('conversational');
    expect(result.subagentName).toBe('Conversational');
  });

  it('collects trace events from amygdala and orchestrator', async () => {
    const amygdalaResult = createMockAmygdalaResult({
      traceEvents: [
        { type: 'amygdala:classify', intent: 'conversation', confidence: 0.9, timestamp: 1 },
      ],
    });

    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator: createMockOrchestrator(),
    });

    const result = await core.invoke(createMinimalInvocation());

    // Should include amygdala trace events
    const amygdalaEvents = result.traceEvents.filter(e => e.type.startsWith('amygdala:'));
    expect(amygdalaEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onThreatScore when amygdala returns a threat score', async () => {
    const onThreatScore = vi.fn();
    const amygdalaResult = createMockAmygdalaResult({
      threat: { score: 0.4, category: 'none', reasoning: 'slightly suspicious' },
    });

    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator: createMockOrchestrator(),
      onThreatScore,
    });

    await core.invoke(createMinimalInvocation());

    expect(onThreatScore).toHaveBeenCalledWith(0.4);
  });

  it('calls onTraceEvent for each event during pipeline', async () => {
    const onTraceEvent = vi.fn();
    const amygdalaResult = createMockAmygdalaResult({
      traceEvents: [
        { type: 'amygdala:classify', intent: 'conversation', confidence: 0.9, timestamp: 1 },
      ],
    });

    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator: createMockOrchestrator(),
    });

    await core.invoke({ ...createMinimalInvocation(), onTraceEvent });

    expect(onTraceEvent).toHaveBeenCalled();
    const eventTypes = onTraceEvent.mock.calls.map((c: unknown[]) => (c[0] as TraceEvent).type);
    expect(eventTypes).toContain('amygdala:classify');
  });

  it('performs memory recall before amygdala and passes context', async () => {
    const memoryPkg = createMockMemoryPackage();
    memoryPkg.state.recall.mockResolvedValue([
      { type: 'observation', subject: 'user', content: 'likes typescript', tags: [], timestamp: 1 },
    ]);
    // formatContext returns non-empty when there are memories
    (memoryPkg as any).formatContext = () => 'User likes typescript.';

    const amygdala = createMockAmygdala();
    const core = createAgentCore({
      toolPackages: [memoryPkg],
      amygdala,
      orchestrator: createMockOrchestrator(),
    });

    await core.invoke(createMinimalInvocation());

    // Memory recall should have been called
    expect(memoryPkg.state.recall).toHaveBeenCalled();
    // Amygdala should receive memory context
    const amygdalaInput = (amygdala as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(amygdalaInput.memoryContext).toBe('User likes typescript.');
  });

  it('applies rewrite guard — falls back to raw message if rewrite matches history', async () => {
    const historyMessage = 'previous question';
    const amygdalaResult = createMockAmygdalaResult({
      rewrittenPrompt: historyMessage, // Bug: amygdala copied a history message
    });

    const orchestrator = createMockOrchestrator();
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator,
    });

    await core.invoke(createMinimalInvocation({
      message: 'current question',
      conversationHistory: [
        { role: 'user', content: historyMessage },
        { role: 'assistant', content: 'answer' },
      ],
    }));

    // Orchestrator should receive the raw message, not the buggy rewrite
    const orchInput = (orchestrator as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orchInput.amygdalaResult.rewrittenPrompt).toBe('current question');
  });

  it('does not override rewrite when current message appears in history (repeated message)', async () => {
    const repeatedMessage = 'hello again';
    const amygdalaResult = createMockAmygdalaResult({
      rewrittenPrompt: repeatedMessage,
    });

    const orchestrator = createMockOrchestrator();
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(amygdalaResult),
      orchestrator,
    });

    await core.invoke(createMinimalInvocation({
      message: repeatedMessage,
      conversationHistory: [
        { role: 'user', content: repeatedMessage },
        { role: 'assistant', content: 'you said that before' },
      ],
    }));

    // Rewrite should NOT be overridden since the current message is the same
    const orchInput = (orchestrator as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orchInput.amygdalaResult.rewrittenPrompt).toBe(repeatedMessage);
  });

  it('passes stream flag through to orchestrator', async () => {
    const orchestrator = createMockOrchestrator();
    const core = createAgentCore({
      toolPackages: [createMockMemoryPackage()],
      amygdala: createMockAmygdala(),
      orchestrator,
    });

    await core.invoke(createMinimalInvocation({ stream: false }));

    const orchInput = (orchestrator as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(orchInput.stream).toBe(false);
  });

  it('memory recall failure does not break the pipeline', async () => {
    const memoryPkg = createMockMemoryPackage();
    memoryPkg.state.recall.mockRejectedValue(new Error('disk full'));

    const core = createAgentCore({
      toolPackages: [memoryPkg],
      amygdala: createMockAmygdala(),
      orchestrator: createMockOrchestrator(),
    });

    // Should not throw
    const result = await core.invoke(createMinimalInvocation());
    expect(result.response).toBe('Hi there!');
  });

  it('emits memory:recall trace event when memories are found', async () => {
    const onTraceEvent = vi.fn();
    const memoryPkg = createMockMemoryPackage();
    memoryPkg.state.recall.mockResolvedValue([
      { type: 'observation', subject: 'user', content: 'likes TS', tags: [], timestamp: 1 },
    ]);
    (memoryPkg as any).formatContext = () => 'User likes TS.';

    const core = createAgentCore({
      toolPackages: [memoryPkg],
      amygdala: createMockAmygdala(),
      orchestrator: createMockOrchestrator(),
    });

    await core.invoke({ ...createMinimalInvocation(), onTraceEvent });

    const memoryRecallEvents = onTraceEvent.mock.calls
      .map((c: unknown[]) => c[0] as Record<string, unknown>)
      .filter(e => e.type === 'memory:recall');
    expect(memoryRecallEvents).toHaveLength(1);
    expect(memoryRecallEvents[0].memoriesRetrieved).toBe(1);
  });
});
