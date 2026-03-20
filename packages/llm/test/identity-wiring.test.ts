import { describe, it, expect, vi } from 'vitest';
import type { AgentCoreConfig, AgentInvocation, InvocationIdentity } from '../src/core/types';
import type { AgentIdentity } from '../src/identity';
import { createAgentCore } from '../src/core';
import { z } from 'zod';
import type { ToolPackage } from '../src/tool';
import type { AmygdalaResult, AmygdalaFn } from '../src/amygdala/types';
import type { OrchestratorFn, OrchestratorResult } from '../src/orchestrator/types';
import type { TraceEvent } from '../src/trace/events';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTool(name: string) {
  return {
    name,
    description: `${name} tool`,
    parameters: z.object({}),
    execute: async () => 'ok',
  };
}

function makeMemoryPkg(): ToolPackage {
  return {
    tools: [makeTool('memory_recall'), makeTool('memory_remember')],
    formatContext: () => '',
    metadata: {
      name: 'memory',
      capabilities: ['recall', 'store'],
      intent: ['memory'],
      sideEffects: false,
      persistence: true,
      scope: 'private' as const,
      consolidation: true,
    },
  };
}

function makeResumePkg(): ToolPackage {
  return {
    tools: [makeTool('get_resume')],
    formatContext: () => '',
    metadata: {
      name: 'resume',
      capabilities: ['resume'],
      intent: ['resume'],
      sideEffects: false,
    },
  };
}

const mockAmygdala: AmygdalaFn = async () => ({
  rewrittenPrompt: 'hello',
  intent: 'informational',
  threat: { score: 0.1, categories: [], reasoning: 'benign' },
  context: { delegatedMessages: [], annotations: [] },
  traceEvents: [],
  usage: { inputTokens: 10, outputTokens: 5, cachedTokens: 0 },
  cost: 0.001,
});

const mockOrchestrator: OrchestratorFn = async () => ({
  agentResult: {
    message: 'Hello!',
    usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0 },
    cost: 0.002,
    toolCalls: [],
  },
  subagentId: 'conversational',
  subagentName: 'Conversational',
  traceEvents: [],
});

// ---------------------------------------------------------------------------
// al-04: commitSha flows into InvocationIdentity
// ---------------------------------------------------------------------------

describe('commitSha in InvocationIdentity', () => {
  it('InvocationIdentity type accepts commitSha', () => {
    const id: InvocationIdentity = {
      interfaceId: 'web',
      isAdmin: false,
      isAuthenticated: true,
      commitSha: 'abc123',
    };
    expect(id.commitSha).toBe('abc123');
  });

  it('commitSha is optional for backward compatibility', () => {
    const id: InvocationIdentity = {
      interfaceId: 'web',
      isAdmin: false,
      isAuthenticated: true,
    };
    expect(id.commitSha).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// al-05: AgentInvocationResult carries agentIdentity
// ---------------------------------------------------------------------------

describe('agentIdentity in pipeline result', () => {
  it('invoke returns agentIdentity when commitSha is provided', async () => {
    const core = createAgentCore({
      toolPackages: [makeMemoryPkg(), makeResumePkg()],
      amygdala: mockAmygdala,
      orchestrator: mockOrchestrator,
    });

    const result = await core.invoke({
      message: 'hello',
      conversationHistory: [],
      identity: {
        interfaceId: 'test',
        isAdmin: false,
        isAuthenticated: true,
        commitSha: 'abc123def456',
      },
    });

    expect(result.agentIdentity).toBeDefined();
    expect(result.agentIdentity!.commitSha).toBe('abc123def456');
    expect(result.agentIdentity!.toolCompositionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.agentIdentity!.derivedPromptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('invoke returns agentIdentity as undefined when no commitSha', async () => {
    const core = createAgentCore({
      toolPackages: [makeMemoryPkg(), makeResumePkg()],
      amygdala: mockAmygdala,
      orchestrator: mockOrchestrator,
    });

    const result = await core.invoke({
      message: 'hello',
      conversationHistory: [],
      identity: {
        interfaceId: 'test',
        isAdmin: false,
        isAuthenticated: true,
      },
    });

    expect(result.agentIdentity).toBeUndefined();
  });

  it('same commit + same tools = same identity hash', async () => {
    const core = createAgentCore({
      toolPackages: [makeMemoryPkg(), makeResumePkg()],
      amygdala: mockAmygdala,
      orchestrator: mockOrchestrator,
    });

    const invoke = (sha: string) => core.invoke({
      message: 'hello',
      conversationHistory: [],
      identity: { interfaceId: 'test', isAdmin: false, isAuthenticated: true, commitSha: sha },
    });

    const r1 = await invoke('abc123');
    const r2 = await invoke('abc123');
    expect(r1.agentIdentity!.toolCompositionHash).toBe(r2.agentIdentity!.toolCompositionHash);
  });

  it('different commits = different identity hashes', async () => {
    const core = createAgentCore({
      toolPackages: [makeMemoryPkg(), makeResumePkg()],
      amygdala: mockAmygdala,
      orchestrator: mockOrchestrator,
    });

    const invoke = (sha: string) => core.invoke({
      message: 'hello',
      conversationHistory: [],
      identity: { interfaceId: 'test', isAdmin: false, isAuthenticated: true, commitSha: sha },
    });

    const r1 = await invoke('abc123');
    const r2 = await invoke('def456');
    expect(r1.agentIdentity!.toolCompositionHash).not.toBe(r2.agentIdentity!.toolCompositionHash);
  });
});
