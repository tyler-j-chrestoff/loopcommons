/**
 * ConflictMonitor types — detects contradictions between memories,
 * channels, and current input.
 *
 * Traces to: brain-architecture.md §2.5
 * Runs parallel to Guardian in the pipeline.
 */

import type { ChannelMessage } from '../router/types';
import type { ConflictFlag } from '../guardian/types';
import type { StoreReceipt } from '@loopcommons/memory/contract';

// ---------------------------------------------------------------------------
// Input / Output
// ---------------------------------------------------------------------------

export type ConflictMonitorInput = {
  /** The normalized channel message being processed. */
  message: ChannelMessage;
  /** Recalled memories formatted as context string. */
  memoryContext: string;
  /** Recent memory writes from the Consolidator (for cross-channel checks). */
  recentConsolidations?: StoreReceipt[];
};

export type ConflictMonitorOutput = {
  /** Detected conflict flags — fed into GuardianInput.conflictFlags. */
  flags: ConflictFlag[];
  /** Trace events for observability. */
  traceEvents: ConflictMonitorTraceEvent[];
};

// ---------------------------------------------------------------------------
// Trace events
// ---------------------------------------------------------------------------

export type ConflictMonitorTraceEvent = {
  type: 'conflict-monitor:check';
  flagsDetected: number;
  flags: ConflictFlag[];
  latencyMs: number;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Function signature
// ---------------------------------------------------------------------------

export type ConflictMonitorFn = (input: ConflictMonitorInput) => ConflictMonitorOutput;
