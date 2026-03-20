/**
 * Embedding strategy for semantic memory recall.
 *
 * Pure functions (cosineSimilarity, keywordScore, blendScore) plus
 * createEmbeddingState which wraps a PersistentState to embed at
 * write time and rank by blended similarity at recall time.
 *
 * The embed function is dependency-injected — no AI SDK import here.
 * This keeps @loopcommons/memory zero-dep beyond zod.
 *
 */

import type { PersistentState, MemoryInput, Memory, RecallQuery, MemoryStats } from './index';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Injected embedding function. Caller provides the AI SDK wiring. */
export type EmbedFn = (text: string) => Promise<number[]>;

export interface EmbeddingStateConfig {
  /** Underlying persistent state (keyword-based). */
  state: PersistentState;
  /** Function that returns an embedding vector for the given text. */
  embed: EmbedFn;
  /** Semantic weight in blended score (default: 0.6). */
  semanticWeight?: number;
  /** Keyword weight in blended score (default: 0.4). */
  keywordWeight?: number;
}

/** Extended recall that accepts an optional query for semantic ranking. */
export interface EmbeddingState extends PersistentState {
  recall(query: RecallQuery, semanticQuery?: string): Promise<Memory[]>;
}

// ---------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------

/** Cosine similarity between two vectors. Returns 0 if either is zero-length. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Fraction of query words found in text (case-insensitive). Returns 0 for empty query. */
export function keywordScore(query: string, text: string): number {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 0;

  const lower = text.toLowerCase();
  const matches = words.filter((w) => lower.includes(w));
  return matches.length / words.length;
}

/** Blend semantic and keyword scores with configurable weights. */
export function blendScore(
  semantic: number,
  keyword: number,
  semanticWeight = 0.6,
  keywordWeight = 0.4,
): number {
  return semanticWeight * semantic + keywordWeight * keyword;
}

// ---------------------------------------------------------------------------
// Searchable text extraction (mirrors tools.ts getSearchableText)
// ---------------------------------------------------------------------------

function getSearchableText(memory: Memory): string {
  switch (memory.type) {
    case 'observation':
      return `${memory.subject} ${memory.content}`;
    case 'learning':
      return `${memory.topic} ${memory.insight}`;
    case 'relationship':
      return `${memory.entity} ${memory.context}`;
    case 'reflection':
      return memory.insight;
  }
}

/** Build the text to embed for a memory input. */
function getEmbeddingText(input: MemoryInput): string {
  switch (input.type) {
    case 'observation':
      return `${input.subject} ${input.content}`;
    case 'learning':
      return `${input.topic} ${input.insight}`;
    case 'relationship':
      return `${input.entity} ${input.context}`;
    case 'reflection':
      return input.insight;
  }
}

// ---------------------------------------------------------------------------
// createEmbeddingState — wraps PersistentState with embedding support
// ---------------------------------------------------------------------------

export function createEmbeddingState(config: EmbeddingStateConfig): EmbeddingState {
  const { state, embed, semanticWeight = 0.6, keywordWeight = 0.4 } = config;

  async function remember(input: MemoryInput): Promise<Memory> {
    // Embed the content, but don't let failures block the write
    let vector: number[] | undefined;
    try {
      vector = await embed(getEmbeddingText(input));
    } catch {
      // Embedding failed — store without vector (graceful degradation)
    }

    const inputWithVector = vector ? { ...input, vector } : input;
    return state.remember(inputWithVector);
  }

  async function recall(query: RecallQuery, semanticQuery?: string): Promise<Memory[]> {
    const results = await state.recall(query);

    // If no semantic query, return base results unchanged
    if (!semanticQuery) return results;

    // Embed the query
    let queryVector: number[];
    try {
      queryVector = await embed(semanticQuery);
    } catch {
      // Embedding failed — return base results
      return results;
    }

    // Score and rank by blended similarity
    const scored = results.map((memory) => {
      const text = getSearchableText(memory);
      const kw = keywordScore(semanticQuery, text);

      // Semantic score: use vector if available, else 0
      const sem = memory.vector
        ? Math.max(0, cosineSimilarity(queryVector, memory.vector))
        : 0;

      const score = blendScore(sem, kw, semanticWeight, keywordWeight);
      return { memory, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.memory);
  }

  async function stats(): Promise<MemoryStats> {
    return state.stats();
  }

  return { recall, remember, stats };
}
