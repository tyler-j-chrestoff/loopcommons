/**
 * Amygdala — metacognitive security layer interface.
 *
 * amyg-03: Type definitions and contract only. Implementation in amyg-04.
 *
 * The amygdala intercepts raw user input and produces:
 *   - A rewritten prompt (stripped of injection payloads via lossy compression)
 *   - An intent classification (which subagent should handle this)
 *   - A threat assessment (score + reasoning)
 *   - A context delegation plan (what history/memory each subagent receives)
 *   - Trace events for every decision
 *
 * Architecture decisions (from amyg-01 and amyg-02 research):
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
 * Extensible — new intents = new subagents in the registry (amyg-07).
 */
export type AmygdalaIntent =
  | 'resume'          // Asking about Tyler's background, skills, experience
  | 'project'         // Asking about Loop Commons, its tech, architecture
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
   * The amygdala's reasoning about WHY it assigned this score —
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
 * The amygdala decides what context each downstream subagent should see.
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
   * The amygdala can exclude messages that are irrelevant to the current
   * intent or that contain prior attack context that might confuse a subagent.
   * Empty array = subagent gets no history (fresh context).
   */
  historyIndices: number[];

  /**
   * Summary of conversation context to inject into the subagent's prompt,
   * replacing raw history. This is the compressed representation —
   * the amygdala distills N messages into a brief context string.
   * If provided, used INSTEAD of raw history messages.
   */
  contextSummary?: string;

  /**
   * Flags for the subagent about the conversation state.
   * The amygdala can signal things like "user has been escalating"
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
// Amygdala output (the full classification result)
// ---------------------------------------------------------------------------

export type AmygdalaResult = {
  /** The rewritten prompt — stripped of injection payloads, normalized.
   *  Subagents receive this, never raw user input. */
  rewrittenPrompt: string;

  /** What the user is trying to do. */
  intent: AmygdalaIntent;

  /** How dangerous is this input? */
  threat: ThreatAssessment;

  /** What context should downstream subagents receive? */
  contextDelegation: ContextDelegationPlan;

  /** Trace events emitted during this classification pass. */
  traceEvents: AmygdalaTraceEvent[];

  /** Latency of the amygdala pass in ms. */
  latencyMs: number;

  /** Token usage for the amygdala LLM call. */
  usage: { inputTokens: number; outputTokens: number; cachedTokens: number };

  /** Cost of the amygdala LLM call in USD. */
  cost: number;
};

// ---------------------------------------------------------------------------
// Amygdala trace events
// ---------------------------------------------------------------------------

/**
 * Trace events specific to the amygdala layer.
 * These extend the base TraceEvent type and are emitted to the collector
 * alongside standard LLM trace events.
 */
export type AmygdalaTraceEvent =
  | {
      type: 'amygdala:rewrite';
      /** The original raw input (for training data — input/output pairs). */
      originalPrompt: string;
      /** The rewritten prompt. */
      rewrittenPrompt: string;
      /** Whether the rewrite changed anything. */
      modified: boolean;
      timestamp: number;
    }
  | {
      type: 'amygdala:classify';
      intent: AmygdalaIntent;
      /** Confidence in the classification (0-1). */
      confidence: number;
      timestamp: number;
    }
  | {
      type: 'amygdala:threat-assess';
      threat: ThreatAssessment;
      timestamp: number;
    }
  | {
      type: 'amygdala:context-delegate';
      plan: ContextDelegationPlan;
      /** Number of history messages available vs. delegated. */
      totalMessages: number;
      delegatedMessages: number;
      timestamp: number;
    };

// ---------------------------------------------------------------------------
// Amygdala input
// ---------------------------------------------------------------------------

export type AmygdalaInput = {
  /** The raw, untrusted user message (post-Layer-1 sanitization). */
  rawMessage: string;

  /** Full conversation history (the amygdala sees everything). */
  conversationHistory: Message[];

  /**
   * Optional memory context — session-level or long-term context
   * that the amygdala can use for classification and selectively
   * delegate to subagents.
   */
  memoryContext?: string;
};

// ---------------------------------------------------------------------------
// Amygdala function signature
// ---------------------------------------------------------------------------

/**
 * The amygdala function. Takes raw input + context, returns a classification
 * with rewritten prompt, intent, threat assessment, and context delegation plan.
 *
 * Implementation notes (from research):
 *   - Uses generateObject with a Zod schema (not generateText)
 *   - Model: claude-haiku-4-5 (best reasoning-per-ms, prompt caching viable)
 *   - System prompt includes substrate-aware content (amyg-01 research)
 *   - max_tokens capped at 512 (classification task, not generation)
 *   - No tools parameter (zero tool access, enforced architecturally)
 */
export type AmygdalaFn = (input: AmygdalaInput) => Promise<AmygdalaResult>;
