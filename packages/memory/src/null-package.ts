/**
 * NullMemory — valid memory ToolPackage with no tools and no-op operations.
 *
 * Orchestrator can derive "you have no persistent memory" from metadata.
 * LLM cannot hallucinate Store/Recall calls because tools array is empty.
 */

import type { ToolDefinition } from './tool-types';
import type { MemoryContract, RecallResult, StoreReceipt, ConsolidateStats } from './contract';

export interface NullMemoryPackage {
  tools: ToolDefinition[];
  formatContext: () => string;
  metadata: {
    name: string;
    capabilities: string[];
    intent: string[];
    sideEffects: boolean;
    persistence: boolean;
    scope: 'private' | 'shared' | 'inherited';
    consolidation: boolean;
  };
  systemMethods: Record<string, (...args: any[]) => Promise<any>>;
  contract: MemoryContract;
}

export function createNullMemoryPackage(): NullMemoryPackage {
  const contract: MemoryContract = {
    async recall(): Promise<RecallResult> {
      return { capsules: [], truncated: false };
    },
    async store(): Promise<StoreReceipt> {
      return { id: 'null', timestamp: new Date().toISOString() };
    },
    async forget(): Promise<void> {},
    async consolidate(): Promise<ConsolidateStats> {
      return { pruned: 0, promoted: 0 };
    },
  };

  return {
    tools: [],
    formatContext: () => '',
    metadata: {
      name: 'null-memory',
      capabilities: [],
      intent: ['memory'],
      sideEffects: false,
      persistence: false,
      scope: 'private',
      consolidation: false,
    },
    systemMethods: {
      consolidate: contract.consolidate,
    },
    contract,
  };
}
