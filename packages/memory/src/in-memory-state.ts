/**
 * Array-backed PersistentState for arena agents.
 *
 * Constructed from a serialized memoryState string (JSON array of Memory[]).
 * No filesystem I/O — everything lives in memory. Provides serialize() to
 * extract the current state back to a string for persistence on TournamentAgent.
 */

import * as crypto from 'node:crypto';
import type { PersistentState, Memory, MemoryInput, MemoryType, MemoryStats, RecallQuery, Modality } from './index';

const DEFAULT_UNCERTAINTY: Record<MemoryType, number> = {
  observation: 0.5,
  learning: 0.4,
  relationship: 0.3,
  reflection: 0.55,
};

const TYPE_TO_MODALITY: Record<MemoryType, Modality> = {
  observation: 'observation',
  learning: 'belief',
  relationship: 'claim',
  reflection: 'hypothesis',
};

export interface InMemoryState extends PersistentState {
  serialize(): string;
}

export function createInMemoryState(serialized: string): InMemoryState {
  let entries: Memory[];
  try {
    const parsed = JSON.parse(serialized);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = [];
  }

  async function recall(query: RecallQuery): Promise<Memory[]> {
    const { type, tags, limit = 20, includeSuperseded = false } = query;

    let result = entries.filter((entry) => {
      if (!includeSuperseded && entry.supersededBy) return false;
      if (type && entry.type !== type) return false;
      if (tags && tags.length > 0) {
        if (!tags.every((t) => entry.tags.includes(t))) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      if (a.uncertainty !== b.uncertainty) return a.uncertainty - b.uncertainty;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

    result = result.slice(0, limit);

    const now = new Date().toISOString();
    for (const recalled of result) {
      recalled.accessCount += 1;
      recalled.lastAccessedAt = now;
    }

    return result;
  }

  async function remember(input: MemoryInput): Promise<Memory> {
    const now = new Date().toISOString();
    const uncertainty = input.uncertainty ?? DEFAULT_UNCERTAINTY[input.type];
    const id = crypto.randomUUID();

    const baseFields = {
      id,
      provenance: {
        agent: 'arena-agent',
        timestamp: now,
        used: [],
        source: input.source ?? 'arena',
      },
      modality: TYPE_TO_MODALITY[input.type],
      uncertainty,
      visibility: input.visibility ?? ('local' as const),
      tags: input.tags ?? [],
      updatedAt: now,
      accessCount: 0,
      ...(input.vector ? { vector: input.vector } : {}),
    };

    let entry: Memory;
    switch (input.type) {
      case 'observation':
        entry = { ...baseFields, type: 'observation', subject: input.subject, content: input.content };
        break;
      case 'learning':
        entry = { ...baseFields, type: 'learning', topic: input.topic, insight: input.insight, applicableTo: input.applicableTo ?? [] };
        break;
      case 'relationship':
        entry = { ...baseFields, type: 'relationship', entity: input.entity, context: input.context, rapport: input.rapport ?? 0.5 };
        break;
      case 'reflection':
        entry = { ...baseFields, type: 'reflection', insight: input.insight, evidence: input.evidence, significance: input.significance };
        break;
    }

    entries.push(entry);
    return entry;
  }

  async function stats(): Promise<MemoryStats> {
    const byType: Record<MemoryType, number> = { observation: 0, learning: 0, relationship: 0, reflection: 0 };
    for (const entry of entries) byType[entry.type]++;
    const timestamps = entries.map((e) => e.updatedAt).sort();
    return {
      totalEntries: entries.length,
      byType,
      oldestEntry: timestamps[0],
      newestEntry: timestamps[timestamps.length - 1],
    };
  }

  function serialize(): string {
    return JSON.stringify(entries);
  }

  return { recall, remember, stats, serialize };
}
