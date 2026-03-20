/**
 * Keyword-based memory recall.
 *
 * Wraps the core memory system (JsonFilePersistentState + createMemoryTools)
 * as a ToolPackage-compatible factory.
 */

import { createJsonFilePersistentState, formatMemoryContext } from './index';
import type { PersistentState } from './index';
import { createMemoryTools } from './tools';
import type { ToolDefinition } from './tool-types';

export interface KeywordMemoryPackageConfig {
  /** Path to the JSON file for persistent storage. */
  filePath?: string;
  /** Optional callback returning the current threat score for tool-level gating. */
  getThreatScore?: () => number;
}

export interface KeywordMemoryPackage {
  tools: ToolDefinition[];
  formatContext: () => string;
  metadata: {
    name: string;
    capabilities: string[];
  };
  /** Direct access to the underlying PersistentState (for amygdala recall, etc.) */
  state: PersistentState;
}

export function createKeywordMemoryPackage(config: KeywordMemoryPackageConfig): KeywordMemoryPackage {
  const state = createJsonFilePersistentState({
    filePath: config.filePath,
  });

  const tools = createMemoryTools({
    state,
    getThreatScore: config.getThreatScore,
  });

  // Cache for formatContext — recall is async but formatContext must be sync.
  // The caller is responsible for calling recall() before formatContext().
  // We store the last recalled memories for context formatting.
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

  return {
    tools,
    formatContext: () => formatMemoryContext(lastRecalled),
    metadata: {
      name: 'keyword-memory',
      capabilities: ['recall', 'remember', 'consolidation'],
    },
    state: wrappedState,
  };
}
