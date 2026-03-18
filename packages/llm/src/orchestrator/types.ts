/**
 * Orchestrator types — the routing layer between amygdala and subagents.
 *
 * These types capture every decision the orchestrator makes:
 * which subagent was chosen, what context was filtered, what tools
 * were scoped. All of this becomes trace data for visualization
 * and training data export.
 */

import type { AmygdalaResult, AmygdalaIntent } from '../amygdala/types';
import type { Message, AgentResult } from '../types';
import type { ToolRegistry } from '../tool';
import type { TraceCollector } from '../trace';

// ---------------------------------------------------------------------------
// Orchestrator trace events — every decision is observable
// ---------------------------------------------------------------------------

/**
 * Emitted when the orchestrator selects a subagent.
 * Shows the routing decision logic: intent → subagent mapping,
 * threat-based override to refusal, confidence thresholds.
 */
export type OrchestratorRouteEvent = {
  type: 'orchestrator:route';
  /** The subagent that was selected. */
  subagentId: string;
  subagentName: string;
  /** The intent from the amygdala that drove the selection. */
  intent: AmygdalaIntent;
  /** Whether a threat override changed the routing (e.g., high threat → refusal). */
  threatOverride: boolean;
  /** The threat score that informed the decision. */
  threatScore: number;
  /** Tools available to the selected subagent. */
  allowedTools: string[];
  /** Brief explanation of why this subagent was chosen. */
  reasoning: string;
  timestamp: number;
};

/**
 * Emitted after context filtering — shows what the subagent actually receives
 * vs. what was available. This is the compression bottleneck made visible.
 */
export type OrchestratorContextFilterEvent = {
  type: 'orchestrator:context-filter';
  /** Total messages in conversation history. */
  totalMessages: number;
  /** Messages the amygdala's delegation plan selected. */
  delegatedMessages: number;
  /** Messages that passed the subagent's context requirements filter. */
  deliveredMessages: number;
  /** Whether a context summary replaced raw history. */
  usedSummary: boolean;
  /** Annotations passed to the subagent. */
  annotations: Array<{ key: string; value: string }>;
  timestamp: number;
};

export type OrchestratorTraceEvent =
  | OrchestratorRouteEvent
  | OrchestratorContextFilterEvent;

// ---------------------------------------------------------------------------
// Orchestrator input/output
// ---------------------------------------------------------------------------

export type OrchestratorInput = {
  /** The amygdala's classification result. */
  amygdalaResult: AmygdalaResult;
  /** The full conversation history (orchestrator filters before passing to subagent). */
  conversationHistory: Message[];
  /** The full tool registry (orchestrator scopes before passing to subagent). */
  toolRegistry: ToolRegistry;
  /** Trace collectors to emit events to. */
  trace?: TraceCollector | TraceCollector[];
  /** Model to use for the subagent. Default: 'claude-haiku-4-5'. */
  model?: string;
  /** Max rounds for the subagent agent loop. Default: 5. */
  maxRounds?: number;
  /** Enable streaming. Default: true. */
  stream?: boolean;
};

export type OrchestratorResult = {
  /** The agent result from the selected subagent. */
  agentResult: AgentResult;
  /** Which subagent handled the request. */
  subagentId: string;
  subagentName: string;
  /** The orchestrator's trace events (routing + context filtering). */
  traceEvents: OrchestratorTraceEvent[];
};

export type OrchestratorFn = (input: OrchestratorInput) => Promise<OrchestratorResult>;
