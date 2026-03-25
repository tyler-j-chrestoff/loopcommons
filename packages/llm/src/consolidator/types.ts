/**
 * Consolidator types — provenance-tracked memory writes with threat gating.
 *
 * Traces to: brain-architecture.md §2.4
 * Runs post-orchestrator in the pipeline.
 * Only subsystem that writes to long-term memory.
 */

import type { ChannelType } from '../router/types';
import type { Intent } from '../guardian/types';
import type { TraceEvent } from '../trace/events';
import type { MemoryContract, StoreReceipt } from '@loopcommons/memory/contract';
import type { Message } from '../types';

// ---------------------------------------------------------------------------
// Provenance — attached to every memory write
// ---------------------------------------------------------------------------

export type MemoryProvenance = {
  channelType: ChannelType;
  threadId?: string;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Consolidation signal — emitted by the pipeline after orchestration
// ---------------------------------------------------------------------------

export type ConsolidationSignal = {
  type: 'interaction_complete';
  threadId?: string;
  channelType: ChannelType;
  userId?: string;
  intent: Intent;
  threatScore: number;
  toolsUsed: string[];
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export type ConsolidatorInput = {
  signal: ConsolidationSignal;
  interactionTrace: TraceEvent[];
  memoryContract: MemoryContract;
  threadHistory: Message[];
};

export type MergeResult = {
  sourceMemories: string[];
  resultMemory: string;
  channelsSeen: ChannelType[];
  confidence: number;
};

export type ConsolidatorOutput = {
  stored: StoreReceipt[];
  merged: MergeResult[];
  pruned: number;
  traceEvents: ConsolidatorTraceEvent[];
};

// ---------------------------------------------------------------------------
// Trace events
// ---------------------------------------------------------------------------

export type ConsolidatorTraceEvent = {
  type: 'consolidator:write';
  stored: number;
  merged: number;
  pruned: number;
  gatingBand: 'full' | 'elevated' | 'blocked' | 'refusal';
  threatScore: number;
  provenance: MemoryProvenance;
  latencyMs: number;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Function signature
// ---------------------------------------------------------------------------

export type ConsolidatorFn = (input: ConsolidatorInput) => Promise<ConsolidatorOutput>;
