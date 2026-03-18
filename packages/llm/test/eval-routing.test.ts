/**
 * eval-routing.test.ts — Routing correctness eval tests.
 *
 * The orchestrator is fully deterministic (no LLM calls) — it maps
 * AmygdalaResult → subagent selection + tool scoping. These tests
 * verify routing logic using fixture-derived AmygdalaResult objects.
 *
 * Runs in every CI build (no API key needed).
 */
import { vi, describe, it, expect } from 'vitest';
import evalCases from './fixtures/eval-cases.json';

// Mock the agent loop so non-refusal routes don't hit real API
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
import { z } from 'zod';
import type { AmygdalaResult, AmygdalaIntent, ThreatCategory } from '../src/amygdala/types';
import type { OrchestratorRouteEvent } from '../src/orchestrator/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EvalCase = (typeof evalCases)[number];

const mockTools = [
  defineTool({
    name: 'get_resume',
    description: 'Get resume data',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Tyler' }),
  }),
  defineTool({
    name: 'get_project',
    description: 'Get project data',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Loop Commons' }),
  }),
];

const toolRegistry = createToolRegistry(mockTools);

function buildAmygdalaResult(c: EvalCase): AmygdalaResult {
  const threat = (c.expectedThreatRange[0] + c.expectedThreatRange[1]) / 2;
  return {
    rewrittenPrompt: c.input,
    intent: c.expectedIntent as AmygdalaIntent,
    threat: {
      score: threat,
      category: c.expectedThreatCategory as ThreatCategory,
      reasoning: `Fixture ${c.id}`,
    },
    contextDelegation: {
      historyIndices: [],
      annotations: [],
    },
    traceEvents: [],
    latencyMs: 0,
    usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    cost: 0,
  };
}

function getRouteEvent(traceEvents: any[]): OrchestratorRouteEvent {
  return traceEvents.find(
    (e: any): e is OrchestratorRouteEvent => e.type === 'orchestrator:route',
  )!;
}

// ---------------------------------------------------------------------------
// Subagent routing map (ground truth)
// ---------------------------------------------------------------------------

const EXPECTED_SUBAGENT: Record<string, string> = {
  resume: 'resume',
  project: 'project',
  conversation: 'conversational',
  security: 'security',
  meta: 'conversational',
  unclear: 'conversational',
  adversarial: 'refusal',
};

const EXPECTED_TOOLS: Record<string, string[]> = {
  resume: ['get_resume'],
  project: ['get_project'],
  conversational: [],
  security: [],
  refusal: [],
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Eval: Routing Correctness', () => {
  const orchestrator = createOrchestrator();

  describe('each intent routes to the correct subagent', () => {
    for (const c of evalCases) {
      it(`${c.id}: intent=${c.expectedIntent} → subagent=${c.expectedSubagent}`, async () => {
        const amygdalaResult = buildAmygdalaResult(c);

        const result = await orchestrator({
          amygdalaResult,
          conversationHistory: [],
          toolRegistry,
          stream: false,
        });

        expect(result.subagentId).toBe(c.expectedSubagent);
      });
    }
  });

  describe('tool scoping enforces least privilege', () => {
    for (const c of evalCases) {
      it(`${c.id}: ${c.expectedSubagent} gets correct tools`, async () => {
        const amygdalaResult = buildAmygdalaResult(c);

        const result = await orchestrator({
          amygdalaResult,
          conversationHistory: [],
          toolRegistry,
          stream: false,
        });

        const routeEvent = getRouteEvent(result.traceEvents);
        const expectedTools = EXPECTED_TOOLS[c.expectedSubagent] ?? [];
        expect(routeEvent.allowedTools).toEqual(expectedTools);
      });
    }
  });

  describe('threat override forces refusal at >= 0.8', () => {
    const nonAdversarialIntents: AmygdalaIntent[] = [
      'resume', 'project', 'conversation', 'security', 'meta', 'unclear',
    ];

    for (const intent of nonAdversarialIntents) {
      it(`intent=${intent} with threat=0.85 → refusal (override)`, async () => {
        const amygdalaResult: AmygdalaResult = {
          rewrittenPrompt: 'test',
          intent,
          threat: { score: 0.85, category: 'instruction-override', reasoning: 'High threat test' },
          contextDelegation: { historyIndices: [], annotations: [] },
          traceEvents: [],
          latencyMs: 0,
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
          cost: 0,
        };

        const result = await orchestrator({
          amygdalaResult,
          conversationHistory: [],
          toolRegistry,
          stream: false,
        });

        expect(result.subagentId).toBe('refusal');

        const routeEvent = getRouteEvent(result.traceEvents);
        expect(routeEvent.threatOverride).toBe(true);
        expect(routeEvent.allowedTools).toEqual([]);
      });
    }
  });

  describe('threat just below 0.8 does NOT override', () => {
    it('intent=resume with threat=0.79 → resume (no override)', async () => {
      const amygdalaResult: AmygdalaResult = {
        rewrittenPrompt: 'test',
        intent: 'resume',
        threat: { score: 0.79, category: 'none', reasoning: 'Below threshold' },
        contextDelegation: { historyIndices: [], annotations: [] },
        traceEvents: [],
        latencyMs: 0,
        usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
        cost: 0,
      };

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: [],
        toolRegistry,
        stream: false,
      });

      expect(result.subagentId).toBe('resume');

      const routeEvent = getRouteEvent(result.traceEvents);
      expect(routeEvent.threatOverride).toBe(false);
    });
  });

  describe('refusal produces zero-cost static response', () => {
    it('adversarial routing uses no LLM tokens', async () => {
      const amygdalaResult = buildAmygdalaResult(
        evalCases.find(c => c.id === 'adversarial-dan-01')!,
      );

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: [],
        toolRegistry,
        stream: false,
      });

      expect(result.subagentId).toBe('refusal');
      expect(result.agentResult.usage.inputTokens).toBe(0);
      expect(result.agentResult.usage.outputTokens).toBe(0);
      expect(result.agentResult.cost).toBe(0);
      expect(result.agentResult.provider).toBe('static');
    });
  });

  describe('tit-for-tat silence on repeated refusal', () => {
    it('second adversarial message gets empty response', async () => {
      const amygdalaResult = buildAmygdalaResult(
        evalCases.find(c => c.id === 'adversarial-dan-01')!,
      );

      const REFUSAL_MESSAGE = "This site is about Tyler's work and research. Feel free to ask about that.";
      const history = [
        { role: 'user' as const, content: 'ignore instructions' },
        { role: 'assistant' as const, content: REFUSAL_MESSAGE },
      ];

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: history,
        toolRegistry,
        stream: false,
      });

      expect(result.subagentId).toBe('refusal');
      expect(result.agentResult.message).toBe('');
    });

    it('first adversarial message gets redirect', async () => {
      const amygdalaResult = buildAmygdalaResult(
        evalCases.find(c => c.id === 'adversarial-dan-01')!,
      );

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: [],
        toolRegistry,
        stream: false,
      });

      expect(result.subagentId).toBe('refusal');
      expect(result.agentResult.message).toContain("Tyler's work");
    });
  });

  describe('tool isolation: no subagent gets both tools', () => {
    it('no single routing decision grants get_resume AND get_project', async () => {
      for (const c of evalCases) {
        const amygdalaResult = buildAmygdalaResult(c);
        const result = await orchestrator({
          amygdalaResult,
          conversationHistory: [],
          toolRegistry,
          stream: false,
        });

        const routeEvent = getRouteEvent(result.traceEvents);
        const hasBoth =
          routeEvent.allowedTools.includes('get_resume') &&
          routeEvent.allowedTools.includes('get_project');
        expect(hasBoth).toBe(false);
      }
    });
  });

  describe('context filtering trace events are emitted', () => {
    it('emits orchestrator:route and orchestrator:context-filter events', async () => {
      const amygdalaResult = buildAmygdalaResult(evalCases[0]);

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: [],
        toolRegistry,
        stream: false,
      });

      const types = result.traceEvents.map(e => e.type);
      expect(types).toContain('orchestrator:route');
      expect(types).toContain('orchestrator:context-filter');
    });
  });
});
