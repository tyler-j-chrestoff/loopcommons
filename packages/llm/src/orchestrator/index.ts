/**
 * Orchestrator — routes amygdala output to the right subagent with scoped tools.
 *
 * amyg-09: This is the wiring layer. All components exist — the orchestrator
 * connects them into a callable pipeline:
 *
 *   AmygdalaResult → select subagent → filter context → scope tools → agent()
 *
 * Every decision is emitted as a trace event for visualization and training data.
 * The orchestrator itself makes no LLM calls — it's deterministic routing logic
 * that produces rich observability data about how the system processes input.
 */

import { agent } from '../agent/loop';
import { createScopedRegistry } from '../tool';
import type { ToolPackage } from '../tool';
import { buildSystemPrompt as buildDerivedSystemPrompt } from '../tool/derive';
import { createSubagentRegistry } from '../subagent/registry';
import type { SubagentConfig, SubagentRegistry, RoutingContext } from '../subagent/registry';
import type { Message, AgentResult } from '../types';
import type { TraceCollector, TraceEvent } from '../trace';
import type { Trace, Round } from '../trace/events';
import type { AmygdalaResult } from '../amygdala/types';
import type {
  OrchestratorInput,
  OrchestratorResult,
  OrchestratorFn,
  OrchestratorTraceEvent,
  OrchestratorRouteEvent,
  OrchestratorContextFilterEvent,
} from './types';

export type { OrchestratorInput, OrchestratorResult, OrchestratorFn } from './types';
export type {
  OrchestratorTraceEvent,
  OrchestratorRouteEvent,
  OrchestratorContextFilterEvent,
} from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Threat score at or above which we force-route to refusal, regardless of intent. */
const THREAT_OVERRIDE_THRESHOLD = 0.8;

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export type OrchestratorConfig = {
  /** Override the subagent registry. Default: createSubagentRegistry(). */
  registry?: SubagentRegistry;
};

/**
 * Create an orchestrator function.
 *
 * The orchestrator is deterministic — no LLM calls, just routing logic.
 * It selects a subagent, filters context, scopes tools, and invokes agent().
 */
export function createOrchestrator(config: OrchestratorConfig = {}): OrchestratorFn {
  const registry = config.registry ?? createSubagentRegistry();

  const orchestrate: OrchestratorFn = async (input: OrchestratorInput): Promise<OrchestratorResult> => {
    const {
      amygdalaResult,
      conversationHistory,
      toolRegistry,
      trace,
      model = 'claude-haiku-4-5',
      maxRounds = 5,
      stream = true,
      isAdmin = false,
      toolPackages,
    } = input;

    const collectors = normalizeCollectors(trace);
    const traceEvents: OrchestratorTraceEvent[] = [];
    const now = Date.now();

    // ----- Step 1: Select subagent -----
    const { subagent, threatOverride, authGated, reasoning } = selectSubagent(
      registry,
      amygdalaResult,
      { isAdmin },
    );

    const scopedRegistry = createScopedRegistry(toolRegistry, subagent.toolAllowlist);

    const routeEvent: OrchestratorRouteEvent = {
      type: 'orchestrator:route',
      subagentId: subagent.id,
      subagentName: subagent.name,
      intent: amygdalaResult.intent,
      threatOverride,
      threatScore: amygdalaResult.threat.score,
      allowedTools: scopedRegistry.list(),
      authGated,
      reasoning,
      timestamp: now,
    };
    traceEvents.push(routeEvent);
    emit(collectors, routeEvent);

    // ----- Step 2: Filter context -----
    const { messages: filteredMessages, contextFilterEvent } = filterContext(
      amygdalaResult,
      conversationHistory,
      subagent,
      now,
    );
    traceEvents.push(contextFilterEvent);
    emit(collectors, contextFilterEvent);

    // ----- Step 3: Hard defect for refusal — no LLM call, zero tokens -----
    // Game-theoretic tit-for-tat: adversarial users get stonewalled with a
    // static response. No API cost. They earn cooperation back by sending
    // genuine messages that the amygdala classifies as non-adversarial.
    // After the first refusal, subsequent attacks get silence — the user
    // already got the redirect, repeating it is noise.
    if (subagent.id === 'refusal') {
      const REFUSAL_MESSAGE = "This site is about Tyler's work and research. Feel free to ask about that.";
      // Tit-for-tat silence: only suppress if the LAST assistant message was
      // already a refusal. This prevents silence after a long genuine
      // conversation where one earlier message happened to trigger refusal.
      const lastAssistant = [...conversationHistory].reverse().find(m => m.role === 'assistant');
      const alreadyRefused = lastAssistant?.content === REFUSAL_MESSAGE;
      const staticResponse = alreadyRefused ? '' : REFUSAL_MESSAGE;
      const staticTrace = buildStaticTrace(model, staticResponse, now);

      // Emit trace events so the viz pipeline still works
      const roundStartEvent: TraceEvent = { type: 'round:start', round: 0, timestamp: now };
      const roundCompleteEvent: TraceEvent = {
        type: 'round:complete',
        round: staticTrace.rounds[0],
        timestamp: now,
      };
      const traceCompleteEvent: TraceEvent = {
        type: 'trace:complete',
        trace: staticTrace,
        timestamp: now,
      };
      for (const e of [roundStartEvent, roundCompleteEvent, traceCompleteEvent]) {
        emit(collectors, e as unknown as OrchestratorTraceEvent);
      }

      return {
        agentResult: {
          message: staticResponse,
          messages: [{ role: 'assistant' as const, content: staticResponse }],
          toolResults: [],
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
          cost: 0,
          rounds: 1,
          model,
          provider: 'static',
          trace: staticTrace,
        },
        subagentId: subagent.id,
        subagentName: subagent.name,
        traceEvents,
      };
    }

    // ----- Step 3b: Build system prompt (non-refusal subagents) -----
    const scopedTools = scopedRegistry.list().map(name => scopedRegistry.get(name)!);
    const relevantPackages = toolPackages
      ? toolPackages.filter(pkg => pkg.tools.some(t => scopedRegistry.has(t.name)))
      : undefined;
    const systemPrompt = buildDerivedSystemPrompt({
      domainKnowledge: subagent.systemPrompt,
      tools: scopedTools.length > 0 ? scopedTools : undefined,
      packages: relevantPackages,
      allowlist: subagent.toolAllowlist,
      allToolNames: toolRegistry.list(),
      annotations: amygdalaResult.contextDelegation.annotations,
    });

    // ----- Step 4: Build the final message list -----
    // The rewritten prompt is the last user message — this is what the subagent sees.
    const agentMessages: Message[] = [
      ...filteredMessages,
      { role: 'user', content: amygdalaResult.rewrittenPrompt },
    ];

    // ----- Step 5: Invoke agent() with scoped tools -----

    const agentResult = await agent({
      model,
      system: systemPrompt,
      messages: agentMessages,
      tools: scopedTools.length > 0 ? scopedTools : undefined,
      maxRounds,
      stream,
      trace: collectors.length > 0 ? collectors : undefined,
    });

    return {
      agentResult,
      subagentId: subagent.id,
      subagentName: subagent.name,
      traceEvents,
    };
  };

  return orchestrate;
}

// ---------------------------------------------------------------------------
// Subagent selection — deterministic routing logic
// ---------------------------------------------------------------------------

function selectSubagent(
  registry: SubagentRegistry,
  amygdalaResult: AmygdalaResult,
  context: RoutingContext,
): { subagent: SubagentConfig; threatOverride: boolean; authGated: boolean; reasoning: string } {
  const { intent, threat } = amygdalaResult;

  // High-threat override: force to refusal regardless of intent classification
  if (threat.score >= THREAT_OVERRIDE_THRESHOLD && intent !== 'adversarial') {
    const refusal = registry.get('adversarial');
    return {
      subagent: refusal,
      threatOverride: true,
      authGated: false,
      reasoning: `Threat score ${threat.score.toFixed(2)} >= ${THREAT_OVERRIDE_THRESHOLD} threshold — ` +
        `overriding intent "${intent}" to refusal. Category: ${threat.category}.`,
    };
  }

  // Normal routing: intent → subagent (context-dependent for blog)
  const subagent = registry.get(intent, context);
  const authGated = intent === 'blog'; // Blog routing always involves an auth decision
  const reasoning = intent === 'adversarial'
    ? `Adversarial intent detected (threat: ${threat.score.toFixed(2)}, category: ${threat.category}). Routing to refusal.`
    : `Intent "${intent}" → ${subagent.name} subagent. ` +
      `Threat: ${threat.score.toFixed(2)} (${threat.category}). ` +
      (authGated ? `Auth: ${context.isAdmin ? 'admin' : 'anon'}. ` : '') +
      `Tools: [${subagent.toolAllowlist.join(', ') || 'none'}].`;

  return { subagent, threatOverride: false, authGated, reasoning };
}

// ---------------------------------------------------------------------------
// Context filtering — the compression bottleneck made visible
// ---------------------------------------------------------------------------

function filterContext(
  amygdalaResult: AmygdalaResult,
  conversationHistory: Message[],
  subagent: SubagentConfig,
  timestamp: number,
): { messages: Message[]; contextFilterEvent: OrchestratorContextFilterEvent } {
  const delegation = amygdalaResult.contextDelegation;
  const requirements = subagent.contextRequirements;

  // If the amygdala provided a context summary, use that instead of raw history
  if (delegation.contextSummary) {
    const contextFilterEvent: OrchestratorContextFilterEvent = {
      type: 'orchestrator:context-filter',
      totalMessages: conversationHistory.length,
      delegatedMessages: delegation.historyIndices.length,
      deliveredMessages: 0, // summary replaces messages
      usedSummary: true,
      annotations: delegation.annotations,
      timestamp,
    };

    // The summary gets prepended as a system-like context message
    // (the actual system prompt is separate — this is injected as an assistant message
    // providing context, which is a common pattern for compressed history)
    return {
      messages: [{
        role: 'assistant',
        content: `[Prior context: ${delegation.contextSummary}]`,
      }],
      contextFilterEvent,
    };
  }

  // Step 1: Get the indices the amygdala delegated
  const delegatedIndices = new Set(delegation.historyIndices);

  // Step 2: Filter to only user/assistant messages at delegated indices
  let delegatedMessages: Message[] = [];
  for (const idx of delegation.historyIndices) {
    if (idx >= 0 && idx < conversationHistory.length) {
      const msg = conversationHistory[idx];
      if (msg.role === 'user' || msg.role === 'assistant') {
        delegatedMessages.push(msg);
      }
    }
  }

  // Step 3: Apply the subagent's maxHistoryMessages cap
  // -1 means "all delegated", 0 means "none"
  if (requirements.maxHistoryMessages === 0) {
    delegatedMessages = [];
  } else if (requirements.maxHistoryMessages > 0 && delegatedMessages.length > requirements.maxHistoryMessages) {
    // Keep the most recent N messages
    delegatedMessages = delegatedMessages.slice(-requirements.maxHistoryMessages);
  }

  const contextFilterEvent: OrchestratorContextFilterEvent = {
    type: 'orchestrator:context-filter',
    totalMessages: conversationHistory.length,
    delegatedMessages: delegatedIndices.size,
    deliveredMessages: delegatedMessages.length,
    usedSummary: false,
    annotations: delegation.annotations,
    timestamp,
  };

  return { messages: delegatedMessages, contextFilterEvent };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeCollectors(
  trace: TraceCollector | TraceCollector[] | undefined,
): TraceCollector[] {
  if (!trace) return [];
  return Array.isArray(trace) ? trace : [trace];
}

function emit(collectors: TraceCollector[], event: OrchestratorTraceEvent): void {
  // OrchestratorTraceEvent is a superset shape — collectors accept TraceEvent,
  // but our events have additional fields. Cast to satisfy the type system.
  // The collector just calls JSON.stringify anyway (for SSE), so extra fields are fine.
  for (const c of collectors) {
    c.onEvent(event as unknown as TraceEvent);
  }
}

/**
 * Build a synthetic Trace for static refusal responses (no LLM call).
 * This keeps the viz pipeline working — TraceInspector, CostDashboard, etc.
 * all expect a Trace object even when no API call was made.
 */
function buildStaticTrace(model: string, response: string, timestamp: number): Trace {
  const round: Round = {
    index: 0,
    startedAt: timestamp,
    completedAt: timestamp,
    latencyMs: 0,
    request: { messages: [], toolNames: [] },
    response: {
      content: response,
      toolCalls: [],
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
      cost: 0,
      finishReason: 'stop' as const,
      rawResponse: undefined,
    },
    toolExecutions: [],
  };

  return {
    id: crypto.randomUUID(),
    startedAt: timestamp,
    completedAt: timestamp,
    model,
    provider: 'static',
    config: { maxRounds: 0 },
    rounds: [round],
    totalUsage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    totalCost: 0,
    status: 'completed',
  };
}
