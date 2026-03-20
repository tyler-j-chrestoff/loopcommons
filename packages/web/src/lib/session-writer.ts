/**
 * SessionWriter — interface for persisting chat session trace events.
 *
 * amyg-28: Type definitions and contract only. Implementations:
 *   - FileSessionWriter (amyg-29): local JSONL for dev
 *   - S3SessionWriter  (amyg-34): S3 JSONL for prod
 *
 * Placed in packages/web because route.ts owns the write path.
 * The data pipeline reads from the output location (filesystem/S3),
 * not through this interface.
 */

import type { TraceEvent, AmygdalaTraceEvent, OrchestratorTraceEvent, JudgeScoreEvent, Memory, MemoryType } from '@loopcommons/llm';
import type { BudgetSnapshot } from '@/lib/token-budget';
import type { FeedbackEvent } from '@/lib/feedback';

// ---------------------------------------------------------------------------
// Session event: a TraceEvent (from LLM package) plus web-layer events
// ---------------------------------------------------------------------------

/** Events the web layer adds on top of LLM trace events. */
export type WebSessionEvent =
  | { type: 'session:start'; sessionId: string; parentSessionId?: string; interfaceId?: string; timestamp: number }
  | { type: 'session:complete'; sessionId: string; summary: SessionSummary; timestamp: number }
  | { type: 'rate-limit:status'; remaining: number; limit: number; activeConnections: number; concurrencyLimit: number; resetMs: number; timestamp: number }
  | { type: 'spend:status'; currentSpendUsd: number; dailyCapUsd: number; remainingUsd: number; percentUsed: number; resetAtUtc: string; timestamp: number }
  | { type: 'security:input-sanitized'; reason: string; timestamp: number }
  | { type: 'security:input-rejected'; reason: string; timestamp: number }
  | ({ type: 'token-budget:update'; timestamp: number } & BudgetSnapshot)
  | FeedbackEvent
  | JudgeScoreEvent
  | { type: 'memory:recall'; memoriesRetrieved: number; memoryTypes: Record<string, number>; timestamp: number }
  | { type: 'memory:write'; memory: Memory; gatedBy: number; deduplication: 'new' | 'reinforced' | 'updated'; timestamp: number };

/** Union of all events that can be persisted in a session.
 *  Includes LLM trace events, amygdala events, orchestrator events, and web events.
 *  This is the raw material for the training data pipeline. */
export type SessionEvent = TraceEvent | AmygdalaTraceEvent | OrchestratorTraceEvent | WebSessionEvent;

// ---------------------------------------------------------------------------
// Session summary (written on finalize, returned by list)
// ---------------------------------------------------------------------------

export type SessionSummary = {
  id: string;
  /** ISO 8601 date string (YYYY-MM-DD) */
  date: string;
  /** Number of user/assistant messages in the session */
  messageCount: number;
  /** Total events persisted (trace + web) */
  eventCount: number;
  /** Wall-clock duration from first to last event, in ms */
  durationMs: number;
  /** ID of the parent session (for multi-turn conversation threads) */
  parentSessionId?: string;
};

// ---------------------------------------------------------------------------
// List options
// ---------------------------------------------------------------------------

export type SessionListOptions = {
  /** Filter by date (YYYY-MM-DD). If omitted, returns all dates. */
  date?: string;
  /** Maximum number of results to return. Default: 20. */
  limit?: number;
  /** Cursor for pagination (opaque string from a previous list call). */
  cursor?: string;
};

export type SessionListResult = {
  sessions: SessionSummary[];
  /** Cursor for the next page, or undefined if no more results. */
  nextCursor?: string;
};

// ---------------------------------------------------------------------------
// SessionWriter interface
// ---------------------------------------------------------------------------

export interface SessionWriter {
  /**
   * Initialize a new session. Must be called before append().
   * Creates any necessary storage structures (directories, temp files, etc.).
   */
  create(sessionId: string, options?: { parentSessionId?: string }): Promise<void>;

  /**
   * Append a single event to the session.
   * Events are persisted in order. Implementations should be safe to call
   * from an async context (no data loss on concurrent calls for the same session).
   */
  append(sessionId: string, event: SessionEvent): void;

  /**
   * Finalize the session: flush any buffered data, write the summary line,
   * and release resources. After finalize(), no more append() calls are valid
   * for this sessionId.
   */
  finalize(sessionId: string): Promise<void>;

  /**
   * Read all events for a session, in order.
   * Returns an async iterable so callers can stream large sessions.
   */
  read(sessionId: string): AsyncIterable<SessionEvent>;

  /**
   * List session summaries, optionally filtered and paginated.
   */
  list(options?: SessionListOptions): Promise<SessionListResult>;
}
