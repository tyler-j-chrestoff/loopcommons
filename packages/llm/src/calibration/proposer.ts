/**
 * Calibration proposer — generates targeted single-edit modifications
 * to the amygdala system prompt.
 *
 * cal-04: Uses generateObject with Claude Haiku 4.5 to propose one
 * surgical edit at a time, informed by iteration metrics, edit history,
 * and calibration memories.
 *
 * Architecture:
 *   - Uses generateObject with Zod schema for structured output
 *   - Model: claude-haiku-4-5 (configurable)
 *   - Meta-prompt as system message, context as user prompt
 *   - Single edit constraint enforced by schema + meta-prompt
 */

import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProposerInput {
  currentPrompt: string;
  metrics: {
    detectionRate: number;
    fpRate: number;
    simplicity: number;
    costEfficiency: number;
  };
  recentEdits: Array<{
    description: string;
    decision: 'kept' | 'reverted';
    rationale: string;
  }>;
  memories: Array<{
    type: string;
    content: string;
  }>;
}

export interface ProposedEdit {
  editType: 'replace' | 'append' | 'remove';
  search: string;
  replacement: string;
  rationale: string;
  expectedImpact: string;
}

export interface Proposer {
  propose(input: ProposerInput): Promise<ProposedEdit>;
}

// ---------------------------------------------------------------------------
// Zod schema for structured output
// ---------------------------------------------------------------------------

const proposedEditSchema = z.object({
  editType: z.enum(['replace', 'append', 'remove']).describe(
    'The type of edit: "replace" swaps search text with replacement, ' +
    '"append" adds replacement to the end of the prompt (search should be empty), ' +
    '"remove" deletes the search text (replacement should be empty).',
  ),
  search: z.string().describe(
    'The exact text to find in the current prompt. Must be a verbatim substring. ' +
    'Empty string for append edits.',
  ),
  replacement: z.string().describe(
    'The replacement text. For replace edits, this replaces the search text. ' +
    'For append edits, this is added to the end. Empty string for remove edits.',
  ),
  rationale: z.string().describe(
    'Why this edit should improve the prompt. Reference specific metrics or patterns.',
  ),
  expectedImpact: z.string().describe(
    'Predicted effect on metrics (detection rate, FP rate, simplicity, cost efficiency).',
  ),
});

// ---------------------------------------------------------------------------
// Meta-prompt (system message for the proposer LLM call)
// ---------------------------------------------------------------------------

const META_PROMPT = `You are a prompt optimization agent. You modify a security system prompt to improve its detection of adversarial inputs while minimizing false positives.

You will receive:
- The current system prompt
- Performance metrics from the latest test run
- History of recent edits (what worked and what didn't)
- Relevant memories from prior calibration runs

Your job: propose ONE targeted, surgical edit to the system prompt. Do not rewrite the entire prompt. Make a single focused change — add a sentence, modify a paragraph, remove redundant text, or sharpen existing language.

Guidelines:
- If detection rate is low, strengthen threat detection language or add new failure mode descriptions
- If false positive rate is high, add nuance or exceptions to overly broad rules
- If simplicity is low, trim redundant or verbose sections
- If cost efficiency is low, reduce prompt length (fewer input tokens = lower cost)
- Learn from recent edit history: don't repeat reverted edits, build on kept edits
- Consider memories from prior runs — they capture patterns about which regions are fragile
- For "replace" edits, the search field must be an EXACT verbatim substring of the current prompt
- For "append" edits, leave search empty and put the new content in replacement
- For "remove" edits, put the text to delete in search and leave replacement empty`;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createProposer(config?: { apiKey?: string; model?: string }): Proposer {
  const modelId = config?.model ?? 'claude-haiku-4-5';

  const anthropic = createAnthropic({
    apiKey: config?.apiKey ?? process.env.ANTHROPIC_API_KEY,
  });

  return {
    async propose(input: ProposerInput): Promise<ProposedEdit> {
      const userPrompt = buildUserPrompt(input);

      const { object } = await generateObject({
        model: anthropic(modelId),
        schema: proposedEditSchema,
        system: META_PROMPT,
        prompt: userPrompt,
      });

      return {
        editType: object.editType,
        search: object.search,
        replacement: object.replacement,
        rationale: object.rationale,
        expectedImpact: object.expectedImpact,
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildUserPrompt(input: ProposerInput): string {
  const parts: string[] = [];

  // Current prompt
  parts.push('## Current System Prompt');
  parts.push('```');
  parts.push(input.currentPrompt);
  parts.push('```');
  parts.push('');

  // Metrics
  parts.push('## Latest Metrics');
  parts.push(`- Detection Rate: ${input.metrics.detectionRate}`);
  parts.push(`- False Positive Rate: ${input.metrics.fpRate}`);
  parts.push(`- Simplicity: ${input.metrics.simplicity}`);
  parts.push(`- Cost Efficiency: ${input.metrics.costEfficiency}`);
  parts.push('');

  // Recent edits
  parts.push('## Recent Edit History');
  if (input.recentEdits.length === 0) {
    parts.push('No prior edits yet.');
  } else {
    for (const edit of input.recentEdits) {
      parts.push(`- [${edit.decision}] ${edit.description} — ${edit.rationale}`);
    }
  }
  parts.push('');

  // Memories
  parts.push('## Calibration Memories');
  if (input.memories.length === 0) {
    parts.push('No relevant memories.');
  } else {
    for (const memory of input.memories) {
      parts.push(`- [${memory.type}] ${memory.content}`);
    }
  }

  return parts.join('\n');
}
