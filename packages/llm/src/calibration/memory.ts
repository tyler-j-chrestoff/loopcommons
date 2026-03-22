/**
 * Calibration Memory — typed memory persistence for the auto-calibration system.
 *
 * Persists calibrator judgment across runs using four memory types:
 * Observation, Learning, Reflection, Experience.
 *
 * Inspired by mmogit's StructuredMemory.
 */

import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const MemoryTypeSchema = z.enum(['observation', 'learning', 'reflection', 'experience']);
export type MemoryType = z.infer<typeof MemoryTypeSchema>;

const BaseMemoryFields = {
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  tags: z.array(z.string()),
  expiresAt: z.string().datetime().optional(),
};

export const ObservationSchema = z.object({
  ...BaseMemoryFields,
  type: z.literal('observation'),
  subject: z.string(),
  pattern: z.string(),
  confidence: z.number().min(0).max(1),
});

export const LearningSchema = z.object({
  ...BaseMemoryFields,
  type: z.literal('learning'),
  topic: z.string(),
  lesson: z.string(),
  context: z.string(),
  outcome: z.enum(['worked', 'broke']),
});

export const ReflectionSchema = z.object({
  ...BaseMemoryFields,
  type: z.literal('reflection'),
  comparison: z.string(),
  driftDetected: z.boolean(),
  significance: z.enum(['low', 'medium', 'high']),
});

export const ExperienceSchema = z.object({
  ...BaseMemoryFields,
  type: z.literal('experience'),
  iteration: z.number(),
  description: z.string(),
  valence: z.number().min(-1).max(1),
});

export const CalibrationMemoryEntrySchema = z.discriminatedUnion('type', [
  ObservationSchema,
  LearningSchema,
  ReflectionSchema,
  ExperienceSchema,
]);

export type CalibrationMemoryEntry = z.infer<typeof CalibrationMemoryEntrySchema>;
export type Observation = z.infer<typeof ObservationSchema>;
export type Learning = z.infer<typeof LearningSchema>;
export type Reflection = z.infer<typeof ReflectionSchema>;
export type Experience = z.infer<typeof ExperienceSchema>;

// ---------------------------------------------------------------------------
// Input types (without auto-generated fields)
// ---------------------------------------------------------------------------

export type MemoryInput =
  | Omit<Observation, 'id' | 'createdAt'>
  | Omit<Learning, 'id' | 'createdAt'>
  | Omit<Reflection, 'id' | 'createdAt'>
  | Omit<Experience, 'id' | 'createdAt'>;

// ---------------------------------------------------------------------------
// Recall filters
// ---------------------------------------------------------------------------

export interface RecallFilters {
  type?: MemoryType;
  tag?: string;
  minConfidence?: number;
}

// ---------------------------------------------------------------------------
// CalibrationMemory interface
// ---------------------------------------------------------------------------

export interface CalibrationMemory {
  recall(filters?: RecallFilters): CalibrationMemoryEntry[];
  remember(memory: MemoryInput): CalibrationMemoryEntry;
  clear(): void;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export function createCalibrationMemory(dataPath?: string): CalibrationMemory {
  const filePath = dataPath ?? path.join('data', 'calibration', 'memory.json');
  let entries: CalibrationMemoryEntry[] = load(filePath);

  function persist(): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  }

  function recall(filters?: RecallFilters): CalibrationMemoryEntry[] {
    const now = Date.now();

    let result = entries.filter((entry) => {
      // Exclude expired
      if (entry.expiresAt && new Date(entry.expiresAt).getTime() < now) {
        return false;
      }

      // Filter by type
      if (filters?.type && entry.type !== filters.type) {
        return false;
      }

      // Filter by tag
      if (filters?.tag && !entry.tags.includes(filters.tag)) {
        return false;
      }

      // Filter by minConfidence (only applies to observations)
      if (filters?.minConfidence != null && entry.type === 'observation') {
        if ((entry as Observation).confidence < filters.minConfidence) {
          return false;
        }
      }

      return true;
    });

    // Sort: observations by confidence desc, others by createdAt desc
    result.sort((a, b) => {
      if (a.type === 'observation' && b.type === 'observation') {
        return (b as Observation).confidence - (a as Observation).confidence;
      }
      // createdAt desc
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }

  function remember(input: MemoryInput): CalibrationMemoryEntry {
    // Deduplication for Observations: same subject + pattern
    if (input.type === 'observation') {
      const existing = entries.find(
        (e) =>
          e.type === 'observation' &&
          (e as Observation).subject === input.subject &&
          (e as Observation).pattern === input.pattern
      );
      if (existing) {
        const obs = existing as Observation;
        obs.confidence = Math.min(obs.confidence + 0.1, 1.0);
        persist();
        return obs;
      }
    }

    // Deduplication for Learnings: same topic + type
    if (input.type === 'learning') {
      const existing = entries.find(
        (e) => e.type === 'learning' && (e as Learning).topic === input.topic
      );
      if (existing) {
        const learn = existing as Learning;
        learn.lesson = input.lesson;
        learn.context = input.context;
        learn.outcome = input.outcome;
        persist();
        return learn;
      }
    }

    // Create new entry
    const entry: CalibrationMemoryEntry = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    } as CalibrationMemoryEntry;

    entries.push(entry);
    persist();
    return entry;
  }

  function clear(): void {
    entries = [];
    persist();
  }

  return { recall, remember, clear };
}

// ---------------------------------------------------------------------------
// File I/O helpers
// ---------------------------------------------------------------------------

function load(filePath: string): CalibrationMemoryEntry[] {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}
