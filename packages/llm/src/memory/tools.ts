/**
 * Memory tools — memory_recall and memory_remember as chat-invocable tools.
 *
 * Same factory pattern as createBlogTools. Accepts PersistentState,
 * returns ToolDefinition[] for the tool registry.
 *
 * mem-07: createMemoryTools factory for the agent-memory milestone.
 */

import { z } from 'zod';
import { defineTool } from '../tool';
import type { ToolDefinition } from '../tool';
import type { PersistentState, MemoryInput, Memory } from './index';

// ---------------------------------------------------------------------------
// Query-time content matching
// ---------------------------------------------------------------------------

function getSearchableText(memory: Memory): string {
  switch (memory.type) {
    case 'observation':
      return `${memory.subject} ${memory.content}`.toLowerCase();
    case 'learning':
      return `${memory.topic} ${memory.insight}`.toLowerCase();
    case 'relationship':
      return `${memory.entity} ${memory.context}`.toLowerCase();
    case 'reflection':
      return memory.insight.toLowerCase();
  }
}

function matchesQuery(memory: Memory, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = getSearchableText(memory);
  return words.every((word) => text.includes(word));
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/** Default uncertainty per type — mirrors index.ts values for gating calc. */
function defaultUncertaintyFor(type: string): number {
  switch (type) {
    case 'observation': return 0.5;
    case 'learning': return 0.4;
    case 'relationship': return 0.3;
    case 'reflection': return 0.55;
    default: return 0.5;
  }
}

/** Threat gating thresholds for memory writes. */
const GATING_BLOCK_THRESHOLD = 0.5;
const GATING_ELEVATE_THRESHOLD = 0.3;
const GATING_UNCERTAINTY_BOOST = 0.2;

export function createMemoryTools(config: {
  state: PersistentState;
  /** Optional callback returning the current threat score for this request.
   *  Called per-execution (not at construction). When provided, memory_remember
   *  is gated: >=0.5 blocked, 0.3-0.49 elevated uncertainty, <0.3 normal. */
  getThreatScore?: () => number;
}): ToolDefinition<any>[] {
  const { state, getThreatScore } = config;

  const memoryRecall = defineTool({
    name: 'memory_recall',
    description:
      "Recall memories from the agent's persistent world model. " +
      'Use this to remember facts about the user, learned preferences, ' +
      'prior conversation context, and synthesized insights. ' +
      'Returns matching memories sorted by relevance.',
    parameters: z.object({
      type: z
        .enum(['observation', 'learning', 'relationship', 'reflection'])
        .optional()
        .describe('Filter by memory type'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Filter by tags (all must match)'),
      query: z
        .string()
        .optional()
        .describe('Free-text query to match against memory content'),
      limit: z
        .number()
        .optional()
        .describe('Maximum number of memories to return (default: 10)'),
    }),
    execute: async ({ type, tags, query, limit }) => {
      let memories = await state.recall({
        type,
        tags,
        limit: limit ?? 10,
      });

      // Apply free-text query filtering (v1: substring match)
      if (query) {
        memories = memories.filter((m) => matchesQuery(m, query));
      }

      return JSON.stringify({ memories, count: memories.length });
    },
  });

  const memoryRemember = defineTool({
    name: 'memory_remember',
    description:
      "Store a new memory in the agent's persistent world model. " +
      'Use this to remember important facts about the user, learned preferences, ' +
      'or insights. Duplicate observations are reinforced (uncertainty decreases). ' +
      'Duplicate learnings are updated.',
    parameters: z.object({
      type: z
        .enum(['observation', 'learning', 'relationship', 'reflection'])
        .describe('What kind of memory to create'),
      subject: z
        .string()
        .optional()
        .describe('For observations: what/who was observed'),
      content: z
        .string()
        .optional()
        .describe('For observations: what was observed'),
      topic: z
        .string()
        .optional()
        .describe('For learnings: what domain this applies to'),
      insight: z
        .string()
        .optional()
        .describe('For learnings/reflections: the learned knowledge or insight'),
      entity: z
        .string()
        .optional()
        .describe('For relationships: who this is about'),
      context: z
        .string()
        .optional()
        .describe('For relationships: what you know about them'),
      tags: z
        .array(z.string())
        .optional()
        .describe('Freeform tags for later recall'),
      evidence: z
        .array(z.string())
        .optional()
        .describe('For reflections: memory IDs that support this insight'),
    }),
    execute: async (input) => {
      // Tool-level threat gating (alive-02)
      if (getThreatScore) {
        const threat = getThreatScore();
        if (threat >= GATING_BLOCK_THRESHOLD) {
          return JSON.stringify({
            error: 'Memory write blocked: current interaction has elevated threat assessment.',
          });
        }
      }

      // Validate type-specific required fields
      let memoryInput: MemoryInput;

      switch (input.type) {
        case 'observation':
          if (!input.subject || !input.content) {
            return JSON.stringify({
              error: 'Observation requires subject and content',
            });
          }
          memoryInput = {
            type: 'observation',
            subject: input.subject,
            content: input.content,
            tags: input.tags,
          };
          break;

        case 'learning':
          if (!input.topic || !input.insight) {
            return JSON.stringify({
              error: 'Learning requires topic and insight',
            });
          }
          memoryInput = {
            type: 'learning',
            topic: input.topic,
            insight: input.insight,
            tags: input.tags,
          };
          break;

        case 'relationship':
          if (!input.entity || !input.context) {
            return JSON.stringify({
              error: 'Relationship requires entity and context',
            });
          }
          memoryInput = {
            type: 'relationship',
            entity: input.entity,
            context: input.context,
            tags: input.tags,
          };
          break;

        case 'reflection':
          if (!input.insight) {
            return JSON.stringify({
              error: 'Reflection requires insight',
            });
          }
          memoryInput = {
            type: 'reflection',
            insight: input.insight,
            evidence: input.evidence ?? [],
            significance: 'minor',
            tags: input.tags,
          };
          break;

        default:
          return JSON.stringify({ error: `Unknown memory type: ${input.type}` });
      }

      // Elevate uncertainty for cautious zone (0.3-0.49 threat)
      if (getThreatScore) {
        const threat = getThreatScore();
        if (threat >= GATING_ELEVATE_THRESHOLD) {
          memoryInput = { ...memoryInput, uncertainty: (memoryInput.uncertainty ?? defaultUncertaintyFor(memoryInput.type)) + GATING_UNCERTAINTY_BOOST };
        }
      }

      const memory = await state.remember(memoryInput);
      return JSON.stringify({ stored: memory });
    },
  });

  return [memoryRecall, memoryRemember];
}
