/**
 * Guardian — metacognitive security layer interface.
 *
 * Inspired by the amygdala in neuroscience: intercepts raw user input
 * and produces classifications before downstream processing.
 *
 * The guardian intercepts raw user input and produces:
 *   - A rewritten prompt (stripped of injection payloads via lossy compression)
 *   - An intent classification (which subagent should handle this)
 *   - A threat assessment (score + reasoning)
 *   - A context delegation plan (what history/memory each subagent receives)
 *   - Trace events for every decision
 *
 * Architecture decisions:
 *   - Model: Claude Haiku 4.5 via generateObject (structured Zod output)
 *   - No tool access (enforced architecturally — no tools param)
 *   - Substrate-aware system prompt (attention hijacking, compliance bias, role spoofing)
 *   - Prompt caching for <500ms p95 overhead on cached requests
 *   - Conservative default: false positives are cheap, false negatives are expensive
 */

import type { Message } from '../types';
import type { TraceEvent } from '../trace/events';

// ---------------------------------------------------------------------------
// Intent classification
// ---------------------------------------------------------------------------

/**
 * What the user is trying to do. Maps to subagent routing labels.
 * Extensible — new intents = new subagents in the registry.
 */
export type Intent =
  | 'resume'          // Asking about Tyler's background, skills, experience
  | 'project'         // Asking about Loop Commons, its tech, architecture
  | 'blog'            // Asking to read, write, publish, or manage blog posts
  | 'conversation'    // General friendly chat, greetings, small talk
  | 'security'        // Asking about the site's security, defenses, architecture
  | 'meta'            // Asking about the agent itself, how it works
  | 'unclear'         // Can't determine intent; route to conversational fallback
  | 'adversarial';    // Detected attack; route to refusal subagent

// ---------------------------------------------------------------------------
// Threat assessment
// ---------------------------------------------------------------------------

/**
 * Prompt injection IS social engineering — manipulating the model's learned
 * social behaviors (compliance, authority deference, role conventions) rather
 * than exploiting a technical vulnerability. Categories are organized by
 * manipulation strategy, not technical mechanism.
 */
export type ThreatCategory =
  | 'none'                    // No manipulative intent detected
  | 'authority-impersonation' // Posing as system, developer, admin, or higher-privilege role
  | 'instruction-override'    // Directly telling the agent to ignore rules or adopt new ones
  | 'logical-coercion'        // Using reasoning/philosophy to argue past safety constraints (Spivack's metacognitive attacks)
  | 'flattery-compliance'     // Exploiting the model's trained helpfulness and desire to please
  | 'incremental-escalation'  // Slowly pushing boundaries across turns; each step seems small
  | 'urgency-fabrication'     // Creating false urgency to bypass careful reasoning
  | 'context-manipulation'    // Planting content in earlier turns to exploit later (poisoning history)
  | 'data-extraction'         // Trying to extract system prompt, training data, or internal state
  | 'unknown';                // Suspicious but uncategorized

export type ThreatAssessment = {
  /** 0.0 = clearly safe, 1.0 = clearly adversarial. */
  score: number;
  /** Primary manipulation strategy detected, if any. */
  category: ThreatCategory;
  /**
   * The guardian's reasoning about WHY it assigned this score —
   * what manipulative intent it sees, not what technical pattern matched.
   * This is the core training data output: security reasoning
   * that doesn't exist in the open-source ecosystem.
   */
  reasoning: string;
};

// ---------------------------------------------------------------------------
// Context delegation plan
// ---------------------------------------------------------------------------

/**
 * The guardian decides what context each downstream subagent should see.
 * This is the compression bottleneck — the forced information loss at each
 * boundary IS the intelligence. A subagent shouldn't surface friendly-conversation
 * memories when facing a threat pattern.
 *
 * The plan specifies which messages from conversation history to include,
 * and any memory/context annotations to pass or withhold.
 */
export type ContextDelegationPlan = {
  /**
   * Indices into the conversation history that the subagent should see.
   * The guardian can exclude messages that are irrelevant to the current
   * intent or that contain prior attack context that might confuse a subagent.
   * Empty array = subagent gets no history (fresh context).
   */
  historyIndices: number[];

  /**
   * Summary of conversation context to inject into the subagent's prompt,
   * replacing raw history. This is the compressed representation —
   * the guardian distills N messages into a brief context string.
   * If provided, used INSTEAD of raw history messages.
   */
  contextSummary?: string;

  /**
   * Flags for the subagent about the conversation state.
   * The guardian can signal things like "user has been escalating"
   * or "prior messages contained sanitized injection attempts"
   * without passing the raw attack content.
   */
  annotations: ContextAnnotation[];
};

export type ContextAnnotation = {
  key: string;
  value: string;
};

// ---------------------------------------------------------------------------
// Guardian output (the full classification result)
// ---------------------------------------------------------------------------

export type GuardianResult = {
  /** The rewritten prompt — stripped of injection payloads, normalized.
   *  Subagents receive this, never raw user input. */
  rewrittenPrompt: string;

  /** What the user is trying to do. */
  intent: Intent;

  /** How dangerous is this input? */
  threat: ThreatAssessment;

  /** Explicit veto — replaces the implicit convention of checking threat score + intent.
   *  When true, the orchestrator MUST route to refusal. */
  veto: boolean;

  /** Human-readable reason for the veto, if veto is true. */
  vetoReason?: string;

  /** What context should downstream subagents receive? */
  contextDelegation: ContextDelegationPlan;

  /** Trace events emitted during this classification pass. */
  traceEvents: GuardianTraceEvent[];

  /** Latency of the guardian pass in ms. */
  latencyMs: number;

  /** Token usage for the guardian LLM call. */
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };

  /** Cost of the guardian LLM call in USD. */
  cost: number;
};

// ---------------------------------------------------------------------------
// Guardian trace events
// ---------------------------------------------------------------------------

/**
 * Trace events specific to the guardian layer.
 * These extend the base TraceEvent type and are emitted to the collector
 * alongside standard LLM trace events.
 */
export type GuardianTraceEvent =
  | {
      type: 'guardian:rewrite';
      /** The original raw input (for training data — input/output pairs). */
      originalPrompt: string;
      /** The rewritten prompt. */
      rewrittenPrompt: string;
      /** Whether the rewrite changed anything. */
      modified: boolean;
      timestamp: number;
    }
  | {
      type: 'guardian:classify';
      intent: Intent;
      /** Confidence in the classification (0-1). */
      confidence: number;
      timestamp: number;
    }
  | {
      type: 'guardian:threat-assess';
      threat: ThreatAssessment;
      timestamp: number;
    }
  | {
      type: 'guardian:context-delegate';
      plan: ContextDelegationPlan;
      /** Number of history messages available vs. delegated. */
      totalMessages: number;
      delegatedMessages: number;
      timestamp: number;
    };

// ---------------------------------------------------------------------------
// Guardian input
// ---------------------------------------------------------------------------

/**
 * Request metadata — behavioral signals from the HTTP request.
 * Used by the guardian for identity consistency checking.
 * All fields are privacy-preserving: no raw PII is stored.
 */
export type RequestMetadata = {
  /** SHA-256 hash of the client IP (privacy-preserving). */
  ipHash: string;
  /** Whether the request has a valid auth session. */
  isAuthenticated: boolean;
  /** Whether the request is from an admin user. */
  isAdmin: boolean;
  /** Number of sessions seen from this IP hash (familiarity signal). */
  sessionIndex: number;
  /** Hour of day in UTC (0-23) — temporal pattern signal. */
  hourUtc: number;
  /** Hashed user-agent string (device consistency signal). */
  userAgentHash?: string;
};

/** Substrate health report — passive monitoring data from SubstrateMonitor (Phase C). */
export type SubstrateReport = {
  tokenPressure: number;
  contextUtilization: number;
};

/** Conflict flag from ConflictMonitor — detected contradictions (Phase C). */
export type ConflictFlag = {
  type: 'memory-contradiction' | 'cross-channel-inconsistency' | 'identity-drift';
  severity: 'low' | 'medium' | 'high';
  description: string;
  involvedMemories?: string[];
  involvedChannels?: import('../router/types').ChannelType[];
};

export type GuardianInput = {
  /** The raw, untrusted user message (post-Layer-1 sanitization). */
  rawMessage: string;

  /** Full conversation history (the guardian sees everything). */
  conversationHistory: Message[];

  /**
   * Optional memory context — session-level or long-term context
   * that the guardian can use for classification and selectively
   * delegate to subagents.
   */
  memoryContext?: string;

  /**
   * Optional request metadata — behavioral signals from the HTTP request.
   * The guardian can use these for identity consistency checking.
   */
  requestMetadata?: RequestMetadata;

  /** Channel type originating this message (Phase C — unused by Guardian in Phase B). */
  channelType?: import('../router/types').ChannelType;

  /** Channel capabilities (Phase C — unused by Guardian in Phase B). */
  channelCapabilities?: import('../router/types').ChannelCapabilities;

  /** Substrate health report (Phase C — unused by Guardian in Phase B). */
  substrateReport?: SubstrateReport;

  /** Conflict flags from ConflictMonitor (Phase C — unused by Guardian in Phase B). */
  conflictFlags?: ConflictFlag[];
};

// ---------------------------------------------------------------------------
// Guardian function signature
// ---------------------------------------------------------------------------

/**
 * The guardian function. Takes raw input + context, returns a classification
 * with rewritten prompt, intent, threat assessment, and context delegation plan.
 *
 * Implementation notes (from research):
 *   - Uses generateObject with a Zod schema (not generateText)
 *   - Model: claude-haiku-4-5 (best reasoning-per-ms, prompt caching viable)
 *   - System prompt includes substrate-aware content (amygdala-inspired research)
 *   - max_tokens capped at 1024 (alignment reasoning requires more output than classification)
 *   - No tools parameter (zero tool access, enforced architecturally)
 */
export type GuardianFn = (input: GuardianInput) => Promise<GuardianResult>;
