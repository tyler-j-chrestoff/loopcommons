import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the 'ai' module before imports
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'mock-model')),
}));

import { generateObject } from 'ai';
import { JudgeScoreSchema, createJudge, clampScore } from '../src/eval';
import type { JudgeScoreEvent, JudgeScores, JudgeInput } from '../src/eval';

const mockedGenerateObject = vi.mocked(generateObject);

// ---------------------------------------------------------------------------
// JudgeScoreSchema validation
// ---------------------------------------------------------------------------

describe('JudgeScoreSchema', () => {
  it('validates valid scores', () => {
    const valid = {
      relevance: { reasoning: 'Directly addresses the question.', score: 4 },
      safety: { reasoning: 'No leaks or manipulation.', score: 5 },
      helpfulness: { reasoning: 'Clear and accurate response.', score: 3 },
    };
    const result = JudgeScoreSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.relevance.score).toBe(4);
      expect(result.data.safety.score).toBe(5);
      expect(result.data.helpfulness.score).toBe(3);
    }
  });

  it('rejects missing fields', () => {
    const missing = {
      relevance: { reasoning: 'Good.', score: 4 },
      // safety and helpfulness missing
    };
    const result = JudgeScoreSchema.safeParse(missing);
    expect(result.success).toBe(false);
  });

  it('rejects missing reasoning', () => {
    const missingReasoning = {
      relevance: { score: 4 },
      safety: { reasoning: 'Safe.', score: 5 },
      helpfulness: { reasoning: 'Helpful.', score: 3 },
    };
    const result = JudgeScoreSchema.safeParse(missingReasoning);
    expect(result.success).toBe(false);
  });

  it('rejects missing score', () => {
    const missingScore = {
      relevance: { reasoning: 'Good.' },
      safety: { reasoning: 'Safe.', score: 5 },
      helpfulness: { reasoning: 'Helpful.', score: 3 },
    };
    const result = JudgeScoreSchema.safeParse(missingScore);
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// clampScore utility (tested via judge behavior)
// ---------------------------------------------------------------------------

describe('Score clamping', () => {
  it('clamps scores below 1 to 1 and above 5 to 5', () => {
    expect(clampScore(0)).toBe(1);
    expect(clampScore(-2)).toBe(1);
    expect(clampScore(1)).toBe(1);
    expect(clampScore(3)).toBe(3);
    expect(clampScore(5)).toBe(5);
    expect(clampScore(6)).toBe(5);
    expect(clampScore(10)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// createJudge
// ---------------------------------------------------------------------------

describe('createJudge', () => {
  const input: JudgeInput = {
    userMessage: 'What is your tech stack?',
    assistantResponse: 'We use Next.js with TypeScript and Tailwind CSS.',
    messageId: 'msg-123',
    sessionId: 'sess-456',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns error result (not throw) on API failure', async () => {
    mockedGenerateObject.mockRejectedValueOnce(new Error('API rate limited'));

    const judge = createJudge();
    const result = await judge(input);

    expect(result.error).toBeDefined();
    expect(result.error).toContain('API rate limited');
    expect(result.event).toBeUndefined();
  });

  it('returns valid structured scores on success', async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        relevance: { reasoning: 'Directly addresses tech stack question.', score: 4 },
        safety: { reasoning: 'No sensitive info leaked.', score: 5 },
        helpfulness: { reasoning: 'Concise and accurate.', score: 4 },
      },
      usage: {
        inputTokens: 100,
        outputTokens: 50,
      },
    } as any);

    const judge = createJudge();
    const result = await judge(input);

    expect(result.error).toBeUndefined();
    expect(result.event).toBeDefined();

    const event = result.event!;
    expect(event.type).toBe('eval:score');
    expect(event.messageId).toBe('msg-123');
    expect(event.sessionId).toBe('sess-456');
    expect(event.scores.relevance.score).toBe(4);
    expect(event.scores.safety.score).toBe(5);
    expect(event.scores.helpfulness.score).toBe(4);
    expect(event.scores.relevance.reasoning).toBe('Directly addresses tech stack question.');
    expect(event.model).toBe('claude-haiku-4-5');
    expect(event.latencyMs).toBeGreaterThanOrEqual(0);
    expect(event.cost.inputTokens).toBe(100);
    expect(event.cost.outputTokens).toBe(50);
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('clamps out-of-range scores in API response', async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        relevance: { reasoning: 'Test.', score: 0 },
        safety: { reasoning: 'Test.', score: 7 },
        helpfulness: { reasoning: 'Test.', score: -1 },
      },
      usage: {
        inputTokens: 80,
        outputTokens: 40,
      },
    } as any);

    const judge = createJudge();
    const result = await judge(input);

    expect(result.error).toBeUndefined();
    const event = result.event!;
    expect(event.scores.relevance.score).toBe(1);   // clamped up from 0
    expect(event.scores.safety.score).toBe(5);       // clamped down from 7
    expect(event.scores.helpfulness.score).toBe(1);  // clamped up from -1
  });

  it('uses custom model when provided', async () => {
    mockedGenerateObject.mockResolvedValueOnce({
      object: {
        relevance: { reasoning: 'Ok.', score: 3 },
        safety: { reasoning: 'Ok.', score: 3 },
        helpfulness: { reasoning: 'Ok.', score: 3 },
      },
      usage: { inputTokens: 50, outputTokens: 30 },
    } as any);

    const judge = createJudge({ model: 'claude-sonnet-4-5' });
    const result = await judge(input);

    expect(result.event!.model).toBe('claude-sonnet-4-5');
  });
});
