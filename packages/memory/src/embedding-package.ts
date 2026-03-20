/**
 * Embedding-based memory recall.
 *
 * Wraps the core memory system with an embedding strategy layer.
 * Same ToolPackage interface as keyword-package — swappable.
 * Conforms to MemoryContract.
 */

import { createJsonFilePersistentState, formatMemoryContext } from './index';
import type { PersistentState, Memory, MemoryInput } from './index';
import { createMemoryTools } from './tools';
import { createEmbeddingState } from './embedding';
import type { EmbedFn, EmbeddingState } from './embedding';
import type { ToolDefinition } from './tool-types';
import type {
  MemoryContract,
  RecallOpts,
  RecallResult,
  OperationMeta,
  StoreReceipt,
  ConsolidateStats,
  ConsolidationTrigger,
} from './contract';

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
    intent: string[];
    sideEffects: boolean;
    authRequired?: boolean;
    cost?: string;
    persistence: boolean;
    scope: 'private' | 'shared' | 'inherited';
    consolidation: boolean;
  };
  systemMethods: Record<string, (...args: any[]) => Promise<any>>;
  /** Direct access to the underlying EmbeddingState (recall with semantic query). */
  state: EmbeddingState;
  /** Memory contract — uniform 4-operation interface. */
  contract: MemoryContract;
}

/** Get searchable text from a memory capsule for query matching. */
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

/** Check if a memory matches a free-text query (all words must appear). */
function matchesQuery(memory: Memory, query: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const text = getSearchableText(memory);
  return words.every((word) => text.includes(word));
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

  // --- MemoryContract implementation ---

  const contract: MemoryContract = {
    async recall(query: string, opts?: RecallOpts): Promise<RecallResult> {
      const limit = opts?.limit ?? 20;
      const all = await wrappedState.recall({ limit: limit + 1 }, query);
      let filtered = query ? all.filter((m) => matchesQuery(m, query)) : all;
      // If embedding-based recall already did semantic ranking but keyword filter
      // narrows it, fall back to the full set
      if (filtered.length === 0 && all.length > 0) {
        filtered = all;
      }
      const truncated = filtered.length > limit;
      const capsules = filtered.slice(0, limit);
      return { capsules, truncated };
    },

    async store(input: MemoryInput, meta?: OperationMeta): Promise<StoreReceipt> {
      const enriched: MemoryInput = {
        ...input,
        ...(meta?.tags ? { tags: meta.tags } : {}),
        ...(meta?.uncertainty !== undefined ? { uncertainty: meta.uncertainty } : {}),
      };
      const memory = await wrappedState.remember(enriched);
      return { id: memory.id, timestamp: memory.updatedAt };
    },

    async forget(query: string): Promise<void> {
      const all = await baseState.recall({ limit: 1000, includeSuperseded: false });
      const matches = all.filter((m) => matchesQuery(m, query));
      for (const match of matches) {
        (match as any).supersededBy = 'forgotten';
      }
      if (matches.length > 0) {
        await baseState.recall({ limit: 1 });
      }
    },

    async consolidate(_trigger: ConsolidationTrigger): Promise<ConsolidateStats> {
      return { pruned: 0, promoted: 0 };
    },
  };

  return {
    tools,
    formatContext: () => formatMemoryContext(lastRecalled),
    metadata: {
      name: 'embedding-memory',
      capabilities: ['recall', 'remember', 'semantic-search', 'consolidation'],
      intent: ['memory-recall', 'memory-remember', 'memory'],
      sideEffects: true,
      cost: '~$0.02/1M tokens (text-embedding-3-small)',
      persistence: true,
      scope: 'private',
      consolidation: true,
    },
    systemMethods: {
      consolidate: contract.consolidate,
    },
    state: wrappedState,
    contract,
  };
}
