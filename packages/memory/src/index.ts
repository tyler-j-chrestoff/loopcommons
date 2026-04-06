/**
 * Agent Memory — capsule-shaped persistent world model.
 *
 * PersistentState interface with JsonFilePersistentState implementation.
 * 4 memory types: observation, learning, relationship, reflection.
 * SDI-compatible capsule envelope (provenance, modality, uncertainty, visibility).
 *
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Zod schemas — capsule envelope + type-specific fields
// ---------------------------------------------------------------------------

export const MemoryTypeSchema = z.enum(['observation', 'learning', 'relationship', 'reflection']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

export const VisibilitySchema = z.enum(['local', 'private-export', 'federation', 'research']);
export type Visibility = z.infer<typeof VisibilitySchema>;

export const ModalitySchema = z.enum(['observation', 'claim', 'belief', 'hypothesis']);
export type Modality = z.infer<typeof ModalitySchema>;

const ProvenanceSchema = z.object({
  agent: z.string(),
  timestamp: z.string(),
  used: z.array(z.string()),
  source: z.string().optional(),
});

const MemoryBaseSchema = z.object({
  id: z.string(),
  provenance: ProvenanceSchema,
  modality: ModalitySchema,
  uncertainty: z.number(),
  visibility: VisibilitySchema,
  tags: z.array(z.string()),
  updatedAt: z.string(),
  supersededBy: z.string().optional(),
  accessCount: z.number(),
  lastAccessedAt: z.string().optional(),
  /** ACC conflict flag: set when dedup detects contradictory content. */
  conflicted: z.boolean().optional(),
  /** Embedding vector — optional, populated by embedding-capable packages. */
  vector: z.array(z.number()).optional(),
});

export const ObservationMemorySchema = MemoryBaseSchema.extend({
  type: z.literal('observation'),
  subject: z.string(),
  content: z.string(),
});

export const LearningMemorySchema = MemoryBaseSchema.extend({
  type: z.literal('learning'),
  topic: z.string(),
  insight: z.string(),
  applicableTo: z.array(z.string()),
});

export const RelationshipMemorySchema = MemoryBaseSchema.extend({
  type: z.literal('relationship'),
  entity: z.string(),
  context: z.string(),
  rapport: z.number(),
});

export const ReflectionMemorySchema = MemoryBaseSchema.extend({
  type: z.literal('reflection'),
  insight: z.string(),
  evidence: z.array(z.string()),
  significance: z.enum(['minor', 'notable', 'major']),
});

export const MemorySchema = z.discriminatedUnion('type', [
  ObservationMemorySchema,
  LearningMemorySchema,
  RelationshipMemorySchema,
  ReflectionMemorySchema,
]);

export type ObservationMemory = z.infer<typeof ObservationMemorySchema>;
export type LearningMemory = z.infer<typeof LearningMemorySchema>;
export type RelationshipMemory = z.infer<typeof RelationshipMemorySchema>;
export type ReflectionMemory = z.infer<typeof ReflectionMemorySchema>;
export type Memory = z.infer<typeof MemorySchema>;

// ---------------------------------------------------------------------------
// Input types (what callers provide — auto-generated fields omitted)
// ---------------------------------------------------------------------------

/** Common optional fields for all memory input types. */
type MemoryInputCommon = {
  tags?: string[];
  uncertainty?: number;
  visibility?: Visibility;
  /** Override provenance source (default: 'conversation'). Used by consolidation. */
  source?: string;
  /** IDs of memories that this entry was derived from. */
  derivedFrom?: string[];
  /** Embedding vector — populated by embedding-capable packages at write time. */
  vector?: number[];
};

export type ObservationInput = MemoryInputCommon & {
  type: 'observation';
  subject: string;
  content: string;
};

export type LearningInput = MemoryInputCommon & {
  type: 'learning';
  topic: string;
  insight: string;
  applicableTo?: string[];
};

export type RelationshipInput = MemoryInputCommon & {
  type: 'relationship';
  entity: string;
  context: string;
  rapport?: number;
};

export type ReflectionInput = MemoryInputCommon & {
  type: 'reflection';
  insight: string;
  evidence: string[];
  significance: 'minor' | 'notable' | 'major';
};

export type MemoryInput = ObservationInput | LearningInput | RelationshipInput | ReflectionInput;

// ---------------------------------------------------------------------------
// Query + Stats types
// ---------------------------------------------------------------------------

export interface RecallQuery {
  type?: MemoryType;
  tags?: string[];
  limit?: number;
  includeSuperseded?: boolean;
}

export interface MemoryStats {
  totalEntries: number;
  byType: Record<MemoryType, number>;
  oldestEntry?: string;
  newestEntry?: string;
}

// ---------------------------------------------------------------------------
// PersistentState interface
// ---------------------------------------------------------------------------

export interface PersistentState {
  recall(query: RecallQuery): Promise<Memory[]>;
  remember(entry: MemoryInput): Promise<Memory>;
  stats(): Promise<MemoryStats>;
}

// ---------------------------------------------------------------------------
// Default uncertainty per type (midpoint of design ranges)
// ---------------------------------------------------------------------------

const DEFAULT_UNCERTAINTY: Record<MemoryType, number> = {
  observation: 0.5,  // range: 0.3-0.7
  learning: 0.4,     // range: 0.3-0.5
  relationship: 0.3, // range: 0.2-0.4
  reflection: 0.55,  // range: 0.4-0.7
};

const TYPE_TO_MODALITY: Record<MemoryType, Modality> = {
  observation: 'observation',
  learning: 'belief',
  relationship: 'claim',
  reflection: 'hypothesis',
};

const MIN_UNCERTAINTY = 0.05;
const UNCERTAINTY_REINFORCEMENT = 0.1;
const CONFLICT_UNCERTAINTY_BOOST = 0.1;

// ---------------------------------------------------------------------------
// ACC conflict detection — heuristic contradiction check
// ---------------------------------------------------------------------------

/**
 * Detect whether two content strings meaningfully contradict each other.
 * Returns true for contradictions, false for refinements/identical content.
 *
 * Heuristic: extract significant words, compute overlap. If the overlap is
 * low relative to both strings (neither is a subset of the other), it's
 * likely a contradiction rather than a refinement.
 */
export function isContradiction(oldContent: string, newContent: string): boolean {
  if (oldContent === newContent) return false;

  const oldLower = oldContent.toLowerCase();
  const newLower = newContent.toLowerCase();

  // Check for negation patterns: one says X, other says "not X" / "no X" / "never X"
  if (hasNegationConflict(oldLower, newLower)) return true;

  // Check for antonym-style contradictions
  if (hasAntonymConflict(oldLower, newLower)) return true;

  // Word overlap heuristic: if neither is a subset of the other, likely contradiction
  const oldWords = significantWords(oldContent);
  const newWords = significantWords(newContent);

  if (oldWords.size === 0 || newWords.size === 0) return false;

  const oldInNew = [...oldWords].filter((w) => fuzzyMatch(w, newWords)).length / oldWords.size;
  const newInOld = [...newWords].filter((w) => fuzzyMatch(w, oldWords)).length / newWords.size;

  // If one is mostly a superset of the other, it's a refinement
  if (oldInNew >= 0.6 || newInOld >= 0.6) return false;

  // Low overlap in both directions = likely contradiction
  return true;
}

/** Check if one string negates a claim in the other. */
function hasNegationConflict(a: string, b: string): boolean {
  const negationPatterns = [
    /\bnot\b/, /\bnever\b/, /\bno\b/, /\bdon't\b/, /\bdoesn't\b/,
    /\bwon't\b/, /\bcan't\b/, /\bhates?\b/, /\bdislikes?\b/,
  ];
  const aHasNeg = negationPatterns.some((p) => p.test(a));
  const bHasNeg = negationPatterns.some((p) => p.test(b));
  // If exactly one has negation, likely contradiction
  return aHasNeg !== bHasNeg;
}

/** Check for common antonym pairs. */
function hasAntonymConflict(a: string, b: string): boolean {
  const antonyms: [string, string][] = [
    ['dark', 'light'], ['true', 'false'], ['yes', 'no'],
    ['always', 'never'], ['frontend', 'backend'], ['mock', 'real'],
    ['unit', 'integration'], ['prefer', 'avoid'], ['like', 'dislike'],
  ];
  for (const [word1, word2] of antonyms) {
    const r1 = new RegExp(`\\b${word1}\\b`);
    const r2 = new RegExp(`\\b${word2}\\b`);
    if ((r1.test(a) && r2.test(b)) || (r2.test(a) && r1.test(b))) return true;
  }
  return false;
}

/** Check if a word fuzzy-matches any word in the set (prefix match, min 4 chars shared). */
function fuzzyMatch(word: string, wordSet: Set<string>): boolean {
  if (wordSet.has(word)) return true;
  // Prefix matching: "functions" matches "functional" (share "function")
  const minPrefix = Math.min(word.length, 4);
  const prefix = word.slice(0, minPrefix);
  for (const w of wordSet) {
    if (w.startsWith(prefix) && Math.abs(w.length - word.length) <= 3) return true;
  }
  return false;
}

/** Extract significant words (lowercase, 3+ chars, no stopwords). */
function significantWords(text: string): Set<string> {
  const stopwords = new Set([
    'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
    'her', 'was', 'one', 'our', 'out', 'has', 'have', 'been', 'with', 'that',
    'this', 'from', 'they', 'will', 'each', 'make', 'like', 'into', 'them',
    'some', 'when', 'very', 'what', 'just', 'than', 'more', 'also', 'about',
  ]);
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length >= 3 && !stopwords.has(w)),
  );
}

// ---------------------------------------------------------------------------
// JsonFilePersistentState implementation
// ---------------------------------------------------------------------------

export function createJsonFilePersistentState(options: {
  filePath?: string;
}): PersistentState {
  const filePath = options.filePath ?? path.join('data', 'memory', 'world-model.json');
  let entries: Memory[] = loadFromDisk(filePath);

  function persist(): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }

  async function recall(query: RecallQuery): Promise<Memory[]> {
    const {
      type,
      tags,
      limit = 20,
      includeSuperseded = false,
    } = query;

    let result = entries.filter((entry) => {
      // Exclude superseded by default
      if (!includeSuperseded && entry.supersededBy) {
        return false;
      }

      // Filter by type
      if (type && entry.type !== type) {
        return false;
      }

      // Filter by tags (AND logic)
      if (tags && tags.length > 0) {
        if (!tags.every((t) => entry.tags.includes(t))) {
          return false;
        }
      }

      return true;
    });

    // Sort: uncertainty asc (most certain first), then updatedAt desc
    result.sort((a, b) => {
      if (a.uncertainty !== b.uncertainty) {
        return a.uncertainty - b.uncertainty;
      }
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    // Apply limit
    result = result.slice(0, limit);

    // Increment accessCount and lastAccessedAt for recalled entries
    const now = new Date().toISOString();
    for (const recalled of result) {
      recalled.accessCount += 1;
      recalled.lastAccessedAt = now;
    }
    if (result.length > 0) {
      persist();
    }

    return result;
  }

  async function remember(input: MemoryInput): Promise<Memory> {
    const now = new Date().toISOString();
    const uncertainty = input.uncertainty ?? DEFAULT_UNCERTAINTY[input.type];

    // Check for deduplication
    if (input.type === 'observation') {
      const existing = entries.find(
        (e) => e.type === 'observation' && !e.supersededBy && (e as ObservationMemory).subject === input.subject
      );
      if (existing) {
        // Supersede the old entry and create a new one with reinforced uncertainty
        const reinforcedUncertainty = Math.max(
          MIN_UNCERTAINTY,
          existing.uncertainty - UNCERTAINTY_REINFORCEMENT
        );
        existing.supersededBy = crypto.randomUUID();

        // ACC conflict detection: is this a contradiction or refinement?
        const oldContent = (existing as ObservationMemory).content;
        const contradiction = isContradiction(oldContent, input.content);
        const finalUncertainty = contradiction
          ? Math.min(1, reinforcedUncertainty + CONFLICT_UNCERTAINTY_BOOST)
          : reinforcedUncertainty;

        const newEntry: ObservationMemory & { conflicted?: boolean } = {
          type: 'observation',
          id: existing.supersededBy,
          subject: input.subject,
          content: input.content,
          provenance: {
            agent: 'loop-commons-agent',
            timestamp: now,
            used: [existing.id],
            source: input.source ?? 'conversation',
          },
          modality: 'observation',
          uncertainty: finalUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
          ...(contradiction ? { conflicted: true } : {}),
          ...(input.vector ? { vector: input.vector } : {}),
        };

        entries.push(newEntry as Memory);
        persist();
        return newEntry as Memory;
      }
    }

    if (input.type === 'learning') {
      const existing = entries.find(
        (e) => e.type === 'learning' && !e.supersededBy && (e as LearningMemory).topic === input.topic
      );
      if (existing) {
        const reinforcedUncertainty = Math.max(
          MIN_UNCERTAINTY,
          existing.uncertainty - UNCERTAINTY_REINFORCEMENT
        );
        existing.supersededBy = crypto.randomUUID();

        // ACC conflict detection for learnings
        const oldInsight = (existing as LearningMemory).insight;
        const contradiction = isContradiction(oldInsight, input.insight);
        const finalUncertainty = contradiction
          ? Math.min(1, reinforcedUncertainty + CONFLICT_UNCERTAINTY_BOOST)
          : reinforcedUncertainty;

        const newEntry: LearningMemory & { conflicted?: boolean } = {
          type: 'learning',
          id: existing.supersededBy,
          topic: input.topic,
          insight: input.insight,
          applicableTo: input.applicableTo ?? (existing as LearningMemory).applicableTo,
          provenance: {
            agent: 'loop-commons-agent',
            timestamp: now,
            used: [existing.id],
            source: input.source ?? 'conversation',
          },
          modality: 'belief',
          uncertainty: finalUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
          ...(contradiction ? { conflicted: true } : {}),
          ...(input.vector ? { vector: input.vector } : {}),
        };

        entries.push(newEntry as Memory);
        persist();
        return newEntry as Memory;
      }
    }

    if (input.type === 'relationship') {
      const existing = entries.find(
        (e) => e.type === 'relationship' && !e.supersededBy && (e as RelationshipMemory).entity === input.entity
      );
      if (existing) {
        const reinforcedUncertainty = Math.max(
          MIN_UNCERTAINTY,
          existing.uncertainty - UNCERTAINTY_REINFORCEMENT
        );
        existing.supersededBy = crypto.randomUUID();

        const newEntry: RelationshipMemory = {
          type: 'relationship',
          id: existing.supersededBy,
          entity: input.entity,
          context: input.context,
          rapport: input.rapport ?? (existing as RelationshipMemory).rapport,
          provenance: {
            agent: 'loop-commons-agent',
            timestamp: now,
            used: [existing.id],
            source: input.source ?? 'conversation',
          },
          modality: 'claim',
          uncertainty: reinforcedUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
          ...(input.vector ? { vector: input.vector } : {}),
        };

        entries.push(newEntry);
        persist();
        return newEntry;
      }
    }

    // No dedup match — create new entry
    const id = crypto.randomUUID();
    const baseFields = {
      id,
      provenance: {
        agent: 'loop-commons-agent',
        timestamp: now,
        used: (input as MemoryInputCommon).derivedFrom
          ?? (input.type === 'reflection' ? (input as ReflectionInput).evidence : []),
        source: (input as MemoryInputCommon).source ?? 'conversation',
      },
      modality: TYPE_TO_MODALITY[input.type],
      uncertainty,
      visibility: input.visibility ?? ('local' as const),
      tags: input.tags ?? [],
      updatedAt: now,
      accessCount: 0,
      ...((input as MemoryInputCommon).vector ? { vector: (input as MemoryInputCommon).vector } : {}),
    };

    let entry: Memory;

    switch (input.type) {
      case 'observation':
        entry = {
          ...baseFields,
          type: 'observation',
          subject: input.subject,
          content: input.content,
        };
        break;
      case 'learning':
        entry = {
          ...baseFields,
          type: 'learning',
          topic: input.topic,
          insight: input.insight,
          applicableTo: input.applicableTo ?? [],
        };
        break;
      case 'relationship':
        entry = {
          ...baseFields,
          type: 'relationship',
          entity: input.entity,
          context: input.context,
          rapport: input.rapport ?? 0.5,
        };
        break;
      case 'reflection':
        entry = {
          ...baseFields,
          type: 'reflection',
          insight: input.insight,
          evidence: input.evidence,
          significance: input.significance,
        };
        break;
    }

    entries.push(entry);
    persist();
    return entry;
  }

  async function stats(): Promise<MemoryStats> {
    const byType: Record<MemoryType, number> = {
      observation: 0,
      learning: 0,
      relationship: 0,
      reflection: 0,
    };

    for (const entry of entries) {
      byType[entry.type]++;
    }

    const timestamps = entries.map((e) => e.updatedAt).sort();

    return {
      totalEntries: entries.length,
      byType,
      oldestEntry: timestamps[0],
      newestEntry: timestamps[timestamps.length - 1],
    };
  }

  return { recall, remember, stats };
}

// ---------------------------------------------------------------------------
// Format memory context for amygdala injection
// ---------------------------------------------------------------------------

export function formatMemoryContext(memories: Memory[]): string {
  if (memories.length === 0) return '';

  const lines = memories.map((m) => {
    const confidence = (1 - m.uncertainty).toFixed(1);
    const source = m.provenance.source && m.provenance.source !== 'conversation'
      ? `, via ${m.provenance.source}`
      : '';
    switch (m.type) {
      case 'observation':
        return `- [observation] ${m.subject}: ${m.content} (confidence: ${confidence}${source})`;
      case 'learning':
        return `- [learning] ${m.topic}: ${m.insight} (confidence: ${confidence}${source})`;
      case 'relationship':
        return `- [relationship] ${m.entity}: ${m.context} (rapport: ${m.rapport.toFixed(1)}${source})`;
      case 'reflection':
        return `- [reflection] ${m.insight} (significance: ${m.significance}${source})`;
    }
  });

  return `Agent memories (${memories.length} entries):\n${lines.join('\n')}`;
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function loadFromDisk(filePath: string): Memory[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
