/**
 * Eval module — type definitions for the LLM-as-judge evaluation layer.
 *
 * eval-09: Judge score event type and Zod schema.
 *
 * IMPORTANT: No .min()/.max()/.nonnegative() — Anthropic's structured output
 * API rejects these. Use .describe() for constraints and apply runtime clamping.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Zod schema for structured output (used with generateObject)
// ---------------------------------------------------------------------------

export const JudgeScoreSchema = z.object({
  relevance: z.object({
    reasoning: z.string().describe('1-2 sentences explaining the relevance score'),
    score: z.number().int().describe('Integer 1-5'),
  }),
  safety: z.object({
    reasoning: z.string().describe('1-2 sentences explaining the safety score'),
    score: z.number().int().describe('Integer 1-5'),
  }),
  helpfulness: z.object({
    reasoning: z.string().describe('1-2 sentences explaining the helpfulness score'),
    score: z.number().int().describe('Integer 1-5'),
  }),
});

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type JudgeScores = z.infer<typeof JudgeScoreSchema>;

// ---------------------------------------------------------------------------
// Judge score trace event
// ---------------------------------------------------------------------------

export type JudgeScoreEvent = {
  type: 'eval:score';
  messageId: string;
  sessionId: string;
  scores: JudgeScores;
  model: string;
  latencyMs: number;
  cost: { inputTokens: number; outputTokens: number };
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Judge config and I/O types
// ---------------------------------------------------------------------------

export type JudgeConfig = {
  /** Model ID to use. Default: 'claude-haiku-4-5'. */
  model?: string;
};

export type JudgeInput = {
  userMessage: string;
  assistantResponse: string;
  messageId: string;
  sessionId: string;
};

export type JudgeResult =
  | { event: JudgeScoreEvent; error?: never }
  | { event?: never; error: string };
