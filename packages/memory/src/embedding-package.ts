/**
 * Embedding-based memory recall.
 *
 * Wraps the core memory system with an embedding strategy layer.
 * Same ToolPackage interface as keyword-package — swappable.
 */

import { createJsonFilePersistentState, formatMemoryContext } from './index';
import type { PersistentState } from './index';
import { createMemoryTools } from './tools';
import { createEmbeddingState } from './embedding';
import type { EmbedFn, EmbeddingState } from './embedding';
import type { ToolDefinition } from './tool-types';

export interface EmbeddingMemoryPackageConfig {
  /** Path to the JSON file for persistent storage. */
  filePath?: string;
  /** Function that returns an embedding vector for the given text. */
  embed: EmbedFn;
  /** Optional callback returning the current threat score for tool-level gating. */
  getThreatScore?: () => number;
  /** Semantic weight in blended score (default: 0.6). */
  semanticWeight?: number;
  /** Keyword weight in blended score (default: 0.4). */
  keywordWeight?: number;
}

export interface EmbeddingMemoryPackage {
  tools: ToolDefinition[];
  formatContext: () => string;
  metadata: {
    name: string;
    capabilities: string[];
    cost?: string;
  };
  /** Direct access to the underlying EmbeddingState (recall with semantic query). */
  state: EmbeddingState;
}

export function createEmbeddingMemoryPackage(config: EmbeddingMemoryPackageConfig): EmbeddingMemoryPackage {
  const baseState = createJsonFilePersistentState({
    filePath: config.filePath,
  });

  const embeddingState = createEmbeddingState({
    state: baseState,
    embed: config.embed,
    semanticWeight: config.semanticWeight,
    keywordWeight: config.keywordWeight,
  });

  // Tools use the embedding state — remember embeds, recall is keyword-only
  // (semantic ranking happens via state.recall(query, semanticQuery) at the API layer)
  const tools = createMemoryTools({
    state: embeddingState,
    getThreatScore: config.getThreatScore,
  });

  // Cache for formatContext — same pattern as keyword-package
  let lastRecalled: Awaited<ReturnType<PersistentState['recall']>> = [];

  const wrappedState: EmbeddingState = {
    recall: async (query, semanticQuery?) => {
      const result = await embeddingState.recall(query, semanticQuery);
      lastRecalled = result;
      return result;
    },
    remember: embeddingState.remember,
    stats: embeddingState.stats,
  };

  return {
    tools,
    formatContext: () => formatMemoryContext(lastRecalled),
    metadata: {
      name: 'embedding-memory',
      capabilities: ['recall', 'remember', 'semantic-search', 'consolidation'],
      cost: '~$0.02/1M tokens (text-embedding-3-small)',
    },
    state: wrappedState,
  };
}
