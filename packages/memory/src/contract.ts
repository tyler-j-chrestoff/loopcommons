/**
 * Memory Contract — 4-operation interface for agent memory.
 *
 * Every orchestrator-level agent MUST have a memory ToolPackage that
 * implements this contract. Strategies (keyword, embedding, null) are
 * swappable behind this interface.
 *
 * Operations are partitioned by caller:
 *   - recall, store, forget: agent tools (LLM-callable)
 *   - consolidate: system method (orchestrator-callable, never in LLM tool list)
 */

import type { Memory, MemoryInput } from './index';

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

export interface RecallOpts {
  /** Maximum number of capsules to return. */
  limit?: number;
  /** Minimum relevance threshold (strategy-dependent: keyword match score or similarity). */
  threshold?: number;
}

export interface RecallResult {
  /** Matching memory capsules, sorted by relevance. */
  capsules: Memory[];
  /** True if more results exist beyond the limit. */
  truncated: boolean;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export type Ttl = 'session' | 'persistent' | { type: 'expiring'; durationMs: number };

export interface OperationMeta {
  /** Time-to-live for this memory. */
  ttl?: Ttl;
  /** Salience hint for consolidation (higher = more important). */
  priority?: number;
  /** Freeform tags. */
  tags?: string[];
  /** Uncertainty override. */
  uncertainty?: number;
}

export interface StoreReceipt {
  /** ID of the stored capsule. */
  id: string;
  /** Timestamp of storage. */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Consolidation
// ---------------------------------------------------------------------------

export type ConsolidationTrigger =
  | { type: 'session_end' }
  | { type: 'pressure' }
  | { type: 'scheduled' };

export interface ConsolidateStats {
  /** Number of capsules pruned (superseded, expired, low-salience). */
  pruned: number;
  /** Number of new higher-order capsules created (learnings, reflections). */
  promoted: number;
}

// ---------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------

export interface MemoryContract {
  /** Recall capsules matching a query. */
  recall(query: string, opts?: RecallOpts): Promise<RecallResult>;
  /** Store a new capsule with optional operation-level metadata. */
  store(input: MemoryInput, meta?: OperationMeta): Promise<StoreReceipt>;
  /** Fuzzy-forget by query (not by ref ID — LLMs hallucinate UUIDs). */
  forget(query: string): Promise<void>;
  /** Lifecycle consolidation signal. Strategy owns how, orchestrator owns when. */
  consolidate(trigger: ConsolidationTrigger): Promise<ConsolidateStats>;
}
