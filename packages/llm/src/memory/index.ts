/**
 * Agent Memory — capsule-shaped persistent world model.
 *
 * PersistentState interface with JsonFilePersistentState implementation.
 * 4 memory types: observation, learning, relationship, reflection.
 * SDI-compatible capsule envelope (provenance, modality, uncertainty, visibility).
 *
 * mem-06: Core module for the agent-memory milestone.
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

export type ObservationInput = {
  type: 'observation';
  subject: string;
  content: string;
  tags?: string[];
  uncertainty?: number;
  visibility?: Visibility;
};

export type LearningInput = {
  type: 'learning';
  topic: string;
  insight: string;
  applicableTo?: string[];
  tags?: string[];
  uncertainty?: number;
  visibility?: Visibility;
};

export type RelationshipInput = {
  type: 'relationship';
  entity: string;
  context: string;
  rapport?: number;
  tags?: string[];
  uncertainty?: number;
  visibility?: Visibility;
};

export type ReflectionInput = {
  type: 'reflection';
  insight: string;
  evidence: string[];
  significance: 'minor' | 'notable' | 'major';
  tags?: string[];
  uncertainty?: number;
  visibility?: Visibility;
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

        const newEntry: ObservationMemory = {
          type: 'observation',
          id: existing.supersededBy,
          subject: input.subject,
          content: input.content,
          provenance: {
            agent: 'loop-commons-agent',
            timestamp: now,
            used: [existing.id],
            source: 'conversation',
          },
          modality: 'observation',
          uncertainty: reinforcedUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
        };

        entries.push(newEntry);
        persist();
        return newEntry;
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

        const newEntry: LearningMemory = {
          type: 'learning',
          id: existing.supersededBy,
          topic: input.topic,
          insight: input.insight,
          applicableTo: input.applicableTo ?? (existing as LearningMemory).applicableTo,
          provenance: {
            agent: 'loop-commons-agent',
            timestamp: now,
            used: [existing.id],
            source: 'conversation',
          },
          modality: 'belief',
          uncertainty: reinforcedUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
        };

        entries.push(newEntry);
        persist();
        return newEntry;
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
            source: 'conversation',
          },
          modality: 'claim',
          uncertainty: reinforcedUncertainty,
          visibility: input.visibility ?? existing.visibility,
          tags: input.tags ?? existing.tags,
          updatedAt: now,
          accessCount: 0,
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
        used: input.type === 'reflection' ? (input as ReflectionInput).evidence : [],
        source: 'conversation' as const,
      },
      modality: TYPE_TO_MODALITY[input.type],
      uncertainty,
      visibility: input.visibility ?? ('local' as const),
      tags: input.tags ?? [],
      updatedAt: now,
      accessCount: 0,
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
    switch (m.type) {
      case 'observation':
        return `- [observation] ${m.subject}: ${m.content} (confidence: ${confidence})`;
      case 'learning':
        return `- [learning] ${m.topic}: ${m.insight} (confidence: ${confidence})`;
      case 'relationship':
        return `- [relationship] ${m.entity}: ${m.context} (rapport: ${m.rapport.toFixed(1)})`;
      case 'reflection':
        return `- [reflection] ${m.insight} (significance: ${m.significance})`;
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
