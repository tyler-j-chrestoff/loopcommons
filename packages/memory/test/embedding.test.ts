import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { createJsonFilePersistentState } from '../src/index';
import type { PersistentState, Memory } from '../src/index';
import {
  cosineSimilarity,
  keywordScore,
  blendScore,
  createEmbeddingState,
} from '../src/embedding';
import type { EmbedFn } from '../src/embedding';

function tmpMemoryPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-emb-'));
  return path.join(dir, 'test-memory.json');
}

// ---------------------------------------------------------------------------
// Pure math: cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  it('handles normalized vectors', () => {
    const a = [0.6, 0.8];
    const b = [0.6, 0.8];
    expect(cosineSimilarity(a, b)).toBeCloseTo(1);
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// keywordScore
// ---------------------------------------------------------------------------

describe('keywordScore', () => {
  it('returns 1 when all query words match', () => {
    expect(keywordScore('hiking outdoors', 'I enjoy hiking and outdoors activities')).toBe(1);
  });

  it('returns 0 when no query words match', () => {
    expect(keywordScore('skiing snowboard', 'hiking and climbing')).toBe(0);
  });

  it('returns fraction for partial match', () => {
    expect(keywordScore('hiking skiing', 'I love hiking in summer')).toBeCloseTo(0.5);
  });

  it('is case-insensitive', () => {
    expect(keywordScore('HIKING', 'hiking trail')).toBe(1);
  });

  it('returns 0 for empty query', () => {
    expect(keywordScore('', 'anything')).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// blendScore
// ---------------------------------------------------------------------------

describe('blendScore', () => {
  it('blends 0.6 semantic + 0.4 keyword by default', () => {
    expect(blendScore(1.0, 0.5)).toBeCloseTo(0.8);
  });

  it('handles zero scores', () => {
    expect(blendScore(0, 0)).toBe(0);
  });

  it('accepts custom weights', () => {
    expect(blendScore(1.0, 0.0, 0.5, 0.5)).toBeCloseTo(0.5);
  });
});

// ---------------------------------------------------------------------------
// createEmbeddingState — wraps PersistentState with embedding support
// ---------------------------------------------------------------------------

describe('createEmbeddingState', () => {
  let filePath: string;
  let baseState: PersistentState;
  let mockEmbed: EmbedFn;
  let embedCalls: string[];

  beforeEach(() => {
    filePath = tmpMemoryPath();
    baseState = createJsonFilePersistentState({ filePath });
    embedCalls = [];
    // Mock embed: returns a deterministic vector based on content hash
    mockEmbed = vi.fn(async (text: string) => {
      embedCalls.push(text);
      // Simple deterministic embedding: first 4 char codes normalized
      const codes = text.split('').slice(0, 4).map((c) => c.charCodeAt(0) / 200);
      while (codes.length < 4) codes.push(0);
      return codes;
    });
  });

  it('embeds content at write time (remember)', async () => {
    const state = createEmbeddingState({ state: baseState, embed: mockEmbed });

    const memory = await state.remember({
      type: 'observation',
      subject: 'user',
      content: 'enjoys hiking in summer',
    });

    expect(memory.vector).toBeDefined();
    expect(memory.vector!.length).toBeGreaterThan(0);
    expect(embedCalls).toHaveLength(1);
    expect(embedCalls[0]).toContain('hiking');
  });

  it('embeds learnings using topic + insight', async () => {
    const state = createEmbeddingState({ state: baseState, embed: mockEmbed });

    await state.remember({
      type: 'learning',
      topic: 'outdoor activities',
      insight: 'user prefers trails over roads',
    });

    expect(embedCalls[0]).toContain('outdoor activities');
    expect(embedCalls[0]).toContain('trails');
  });

  it('recall returns results ranked by blended similarity', async () => {
    // Use a more meaningful mock: embed returns a vector close to input
    const embedMap: Record<string, number[]> = {
      'user enjoys hiking in summer': [1, 0, 0, 0],
      'user likes swimming in pools': [0, 1, 0, 0],
      'user prefers coding at night': [0, 0, 1, 0],
      'hiking outdoors': [0.9, 0.1, 0, 0], // close to hiking
    };
    const smartEmbed: EmbedFn = async (text) => {
      return embedMap[text] ?? [0, 0, 0, 0];
    };

    const state = createEmbeddingState({ state: baseState, embed: smartEmbed });

    await state.remember({ type: 'observation', subject: 'user', content: 'enjoys hiking in summer' });
    await state.remember({ type: 'observation', subject: 'user2', content: 'likes swimming in pools' });
    await state.remember({ type: 'observation', subject: 'user3', content: 'prefers coding at night' });

    const results = await state.recall({ limit: 10 }, 'hiking outdoors');
    expect(results.length).toBeGreaterThan(0);
    // Hiking should rank first (highest semantic similarity)
    expect((results[0] as any).subject).toBe('user');
  });

  it('recall without query falls back to base behavior', async () => {
    const state = createEmbeddingState({ state: baseState, embed: mockEmbed });

    await state.remember({ type: 'observation', subject: 'a', content: 'hello' });
    await state.remember({ type: 'observation', subject: 'b', content: 'world' });

    const results = await state.recall({ limit: 10 });
    expect(results).toHaveLength(2);
  });

  it('stats() delegates to base state', async () => {
    const state = createEmbeddingState({ state: baseState, embed: mockEmbed });
    await state.remember({ type: 'observation', subject: 'a', content: 'b' });

    const stats = await state.stats();
    expect(stats.totalEntries).toBe(1);
  });

  it('handles memories without vectors gracefully (backward compat)', async () => {
    // Write directly to base state (no vector)
    await baseState.remember({ type: 'observation', subject: 'legacy', content: 'old data' });

    const state = createEmbeddingState({ state: baseState, embed: mockEmbed });
    // Query — legacy entry has no vector, should still appear but rank lower
    const results = await state.recall({ limit: 10 }, 'something');
    expect(results).toHaveLength(1);
  });

  it('embed failure does not block remember', async () => {
    const failEmbed: EmbedFn = async () => { throw new Error('API down'); };
    const state = createEmbeddingState({ state: baseState, embed: failEmbed });

    const memory = await state.remember({
      type: 'observation',
      subject: 'test',
      content: 'hello',
    });

    // Should still store, just without vector
    expect(memory.id).toBeTruthy();
    expect(memory.vector).toBeUndefined();
  });
});
