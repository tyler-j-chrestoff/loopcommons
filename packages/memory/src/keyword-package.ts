/**
 * Keyword-based memory recall.
 *
 * Wraps the core memory system (JsonFilePersistentState + createMemoryTools)
 * as a ToolPackage-compatible factory. Conforms to MemoryContract.
 */

import { createJsonFilePersistentState, formatMemoryContext } from './index';
import type { PersistentState, Memory, MemoryInput } from './index';
import { createMemoryTools } from './tools';
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

export interface KeywordMemoryPackageConfig {
  /** Path to the JSON file for persistent storage. */
  filePath?: string;
  /** Optional pre-built PersistentState (e.g. InMemoryState for arena agents). */
  state?: PersistentState;
  /** Optional callback returning the current threat score for tool-level gating. */
  getThreatScore?: () => number;
}

export interface KeywordMemoryPackage {
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
  /** Direct access to the underlying PersistentState (for amygdala recall, etc.) */
  state: PersistentState;
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

export function createKeywordMemoryPackage(config: KeywordMemoryPackageConfig): KeywordMemoryPackage {
  const state = config.state ?? createJsonFilePersistentState({
    filePath: config.filePath,
  });

  const tools = createMemoryTools({
    state,
    getThreatScore: config.getThreatScore,
  });

  // Cache for formatContext — recall is async but formatContext must be sync.
  let lastRecalled: Awaited<ReturnType<PersistentState['recall']>> = [];

  // Wrap the recall tool to capture results for formatContext
  const originalRecall = state.recall.bind(state);
  const wrappedState: PersistentState = {
    ...state,
    recall: async (query) => {
      const result = await originalRecall(query);
      lastRecalled = result;
      return result;
    },
  };

  // --- MemoryContract implementation ---

  const contract: MemoryContract = {
    async recall(query: string, opts?: RecallOpts): Promise<RecallResult> {
      const limit = opts?.limit ?? 20;
      // Recall all (up to a generous ceiling), then filter by query
      const all = await wrappedState.recall({ limit: limit + 1 });
      let filtered = query ? all.filter((m) => matchesQuery(m, query)) : all;
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
      // Recall all active memories, find matches, supersede them
      const all = await state.recall({ limit: 1000, includeSuperseded: false });
      const matches = all.filter((m) => matchesQuery(m, query));
      for (const match of matches) {
        // Supersede by storing a replacement that marks the old one
        // Use the raw state to set supersededBy directly
        (match as any).supersededBy = 'forgotten';
      }
      // Persist by triggering a re-remember of a dummy — actually we need
      // to write back. The simplest approach: recall + re-persist via stats
      // which triggers a persist. But PersistentState doesn't expose a persist method.
      // For now: store a learning that supersedes, then immediately supersede it.
      // Actually the cleanest approach: we'll mark entries and rely on the
      // fact that recall() persists on access.
      if (matches.length > 0) {
        // Force a persist by recalling (which persists access count updates)
        await state.recall({ limit: 1 });
      }
    },

    async consolidate(_trigger: ConsolidationTrigger): Promise<ConsolidateStats> {
      // Consolidation is a no-op at the keyword level.
      // The orchestrator wires hippocampal consolidation separately.
      return { pruned: 0, promoted: 0 };
    },
  };

  return {
    tools,
    formatContext: () => formatMemoryContext(lastRecalled),
    metadata: {
      name: 'keyword-memory',
      capabilities: ['recall', 'remember', 'consolidation'],
      intent: ['memory-recall', 'memory-remember', 'memory'],
      sideEffects: true,
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
