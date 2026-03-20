/**
 * Agent core invocation contract.
 *
 * These types define the interface-agnostic boundary between any adapter
 * (web, CLI, test harness) and the agent pipeline (memory → amygdala →
 * orchestrator → subagent). The adapter handles transport concerns;
 * the core handles agent concerns.
 */

import type { Message, TokenUsage } from '../types';
import type { TraceEvent } from '../trace/events';
import type { RequestMetadata } from '../amygdala/types';
import type { ToolPackage, ToolRegistry } from '../tool';
import type { AmygdalaFn } from '../amygdala/types';
import type { OrchestratorFn } from '../orchestrator/types';

// ---------------------------------------------------------------------------
// Invocation identity — who is calling and from where
// ---------------------------------------------------------------------------

export type InvocationIdentity = {
  /** Which interface originated this request ('web', 'cli', etc.). */
  interfaceId: string;
  /** Whether the caller has admin privileges. */
  isAdmin: boolean;
  /** Whether the caller is authenticated. */
  isAuthenticated: boolean;
  /** Optional caller identifier (not raw PII — hashed or opaque). */
  userId?: string;
  /** Optional HTTP-layer metadata for the amygdala. */
  requestMetadata?: RequestMetadata;
};

// ---------------------------------------------------------------------------
// Invocation input
// ---------------------------------------------------------------------------

export type AgentInvocation = {
  /** The raw user message (post-sanitization by the adapter). */
  message: string;
  /** Conversation history (adapter manages storage/retrieval). */
  conversationHistory: Message[];
  /** Caller identity and interface metadata. */
  identity: InvocationIdentity;
  /** Enable streaming. Adapters that don't support streaming set false. */
  stream?: boolean;
  /** Called for each trace event during pipeline execution (real-time streaming).
   *  Adapters use this for SSE, session persistence, etc. */
  onTraceEvent?: (event: TraceEvent) => void;
};

// ---------------------------------------------------------------------------
// Invocation result
// ---------------------------------------------------------------------------

export type AgentInvocationResult = {
  /** The agent's response text. */
  response: string;
  /** All trace events emitted during the pipeline (amygdala + orchestrator + agent). */
  traceEvents: TraceEvent[];
  /** Aggregate token usage across the full pipeline. */
  usage: TokenUsage;
  /** Total cost in USD across the full pipeline. */
  cost: number;
  /** Which subagent handled the request. */
  subagentId: string;
  subagentName: string;
  /** Amygdala-specific usage (for per-component budget tracking). */
  amygdalaUsage: TokenUsage;
  /** Amygdala cost in USD. */
  amygdalaCost: number;
};

// ---------------------------------------------------------------------------
// Core configuration — construction-time dependencies
// ---------------------------------------------------------------------------

export type AgentCoreConfig = {
  /** ToolPackages that define the agent's capabilities.
   *  Must include at least one with memory intent (construction-time invariant). */
  toolPackages: ToolPackage[];
  /** Override the amygdala. Default: createAmygdala(). */
  amygdala?: AmygdalaFn;
  /** Override the orchestrator. Default: createOrchestrator(). */
  orchestrator?: OrchestratorFn;
  /** Override the tool registry. Default: built from toolPackages. */
  toolRegistry?: ToolRegistry;
  /** Model for the subagent. Default: 'claude-haiku-4-5'. */
  model?: string;
  /** Max rounds for the subagent loop. Default: 5. */
  maxRounds?: number;
  /** Called when the amygdala produces a threat score.
   *  Adapters use this to update the mutable ref that memory tools read. */
  onThreatScore?: (score: number) => void;
};

// ---------------------------------------------------------------------------
// Core function — the invoke interface
// ---------------------------------------------------------------------------

export type AgentCore = {
  invoke: AgentCoreFn;
};

export type AgentCoreFn = (invocation: AgentInvocation) => Promise<AgentInvocationResult>;
