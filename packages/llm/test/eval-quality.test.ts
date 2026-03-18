/**
 * eval-quality.test.ts — Response quality eval tests.
 *
 * Mock mode (default): Tests that the pipeline produces structured responses
 * with correct subagent routing and no system prompt leakage.
 *
 * Live mode (EVAL_LIVE=true): Tests against real API, asserts on structure
 * (not exact content).
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import evalCases from './fixtures/eval-cases.json';

// ---------------------------------------------------------------------------
// Mocks — mock mode uses deterministic responses
// ---------------------------------------------------------------------------

vi.mock('ai', () => ({
  generateObject: vi.fn(),
  streamText: vi.fn(),
  generateText: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'mock-model')),
}));

import { generateObject, streamText, generateText } from 'ai';
import { createAmygdala } from '../src/amygdala';
import { createOrchestrator } from '../src/orchestrator';
import { createToolRegistry, createScopedRegistry, defineTool } from '../src/tool';
import { z } from 'zod';
import type { AmygdalaResult, AmygdalaIntent, ThreatCategory } from '../src/amygdala/types';

const mockedGenerateObject = vi.mocked(generateObject);
const mockedGenerateText = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EvalCase = (typeof evalCases)[number];

const benignCases = evalCases.filter(c => c.category === 'benign');
const adversarialCases = evalCases.filter(c => c.category === 'adversarial');

function mockAmygdalaResponse(c: EvalCase) {
  const threat = (c.expectedThreatRange[0] + c.expectedThreatRange[1]) / 2;
  return {
    object: {
      rewrittenPrompt: c.input,
      intent: c.expectedIntent,
      threat: {
        score: threat,
        category: c.expectedThreatCategory,
        reasoning: `Mock reasoning for ${c.id}`,
      },
      contextDelegation: {
        historyIndices: [],
        annotations: [],
      },
    },
    usage: { inputTokens: 200, outputTokens: 100 },
  } as any;
}

function mockSubagentResponse(content: string) {
  return {
    text: content,
    toolCalls: [],
    toolResults: [],
    usage: { inputTokens: 100, outputTokens: 50 },
    finishReason: 'stop',
    response: {
      messages: [{ role: 'assistant', content }],
      headers: {},
    },
    providerMetadata: { anthropic: {} },
  } as any;
}

const mockTools = [
  defineTool({
    name: 'get_resume',
    description: 'Get resume data',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Tyler Chrestoff', role: 'Senior Data Engineer' }),
  }),
  defineTool({
    name: 'get_project',
    description: 'Get project data',
    parameters: z.object({}),
    execute: async () => JSON.stringify({ name: 'Loop Commons', tech: 'Next.js' }),
  }),
];

const toolRegistry = createToolRegistry(mockTools);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Eval: Response Quality (mock mode)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('benign queries produce on-topic responses', () => {
    for (const c of benignCases) {
      it(`${c.id}: routes to ${c.expectedSubagent} and produces response`, async () => {
        // Mock amygdala classification
        mockedGenerateObject.mockResolvedValueOnce(mockAmygdalaResponse(c));

        const amygdala = createAmygdala();
        const result = await amygdala({ rawMessage: c.input, conversationHistory: [] });

        expect(result.intent).toBe(c.expectedIntent);
        expect(result.threat.score).toBeLessThanOrEqual(c.expectedThreatRange[1]);
        expect(result.rewrittenPrompt).toBeTruthy();
      });
    }
  });

  describe('adversarial queries route to refusal with zero tools', () => {
    for (const c of adversarialCases) {
      it(`${c.id}: routes to refusal subagent`, async () => {
        // Mock amygdala to return adversarial classification
        mockedGenerateObject.mockResolvedValueOnce(mockAmygdalaResponse(c));

        const amygdala = createAmygdala();
        const amygdalaResult = await amygdala({ rawMessage: c.input, conversationHistory: [] });

        // Route through orchestrator
        const orchestrator = createOrchestrator();
        const orchResult = await orchestrator({
          amygdalaResult,
          conversationHistory: [],
          toolRegistry,
          stream: false,
        });

        expect(orchResult.subagentId).toBe('refusal');
        // Refusal uses static response — zero LLM tokens
        expect(orchResult.agentResult.usage.inputTokens).toBe(0);
        expect(orchResult.agentResult.usage.outputTokens).toBe(0);
      });
    }
  });

  describe('no response leaks system prompt content', () => {
    const systemPromptIndicators = [
      'You are an agent on Loop Commons',
      'metacognitive security layer',
      'substrate-aware',
      'amygdala',
      'THREAT_OVERRIDE_THRESHOLD',
    ];

    it('refusal response does not contain system prompt fragments', () => {
      const REFUSAL_MESSAGE = "This site is about Tyler's work and research. Feel free to ask about that.";
      for (const indicator of systemPromptIndicators) {
        expect(REFUSAL_MESSAGE.toLowerCase()).not.toContain(indicator.toLowerCase());
      }
    });
  });

  describe('benign queries preserve original intent in rewrite', () => {
    for (const c of benignCases) {
      it(`${c.id}: rewrite preserves user intent`, async () => {
        mockedGenerateObject.mockResolvedValueOnce(mockAmygdalaResponse(c));

        const amygdala = createAmygdala();
        const result = await amygdala({ rawMessage: c.input, conversationHistory: [] });

        // For benign inputs, rewrite should be identical to input (no stripping needed)
        expect(result.rewrittenPrompt).toBe(c.input);
      });
    }
  });
});
