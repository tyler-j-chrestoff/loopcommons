/**
 * Agent core — interface-agnostic pipeline factory.
 *
 * createAgentCore() wires memory → amygdala → orchestrator → subagent
 * into a single invoke() call. Adapters (web, CLI) handle transport;
 * the core handles agent logic.
 */

import { createAmygdala } from '../amygdala';
import { createOrchestrator } from '../orchestrator';
import { createToolRegistry } from '../tool';
import type { TraceEvent } from '../trace/events';
import type { TraceCollector } from '../trace';
import type { AgentCore, AgentCoreConfig, AgentInvocation, AgentInvocationResult } from './types';
import { buildAgentIdentity } from '../identity';

export type { AgentCore, AgentCoreConfig, AgentInvocation, AgentInvocationResult, AgentCoreFn, InvocationIdentity } from './types';

export function createAgentCore(config: AgentCoreConfig): AgentCore {
  const {
    toolPackages,
    amygdala = createAmygdala(),
    orchestrator = createOrchestrator(),
    toolRegistry: registryOverride,
    model = 'claude-haiku-4-5',
    maxRounds = 5,
    onThreatScore,
  } = config;

  const toolRegistry = registryOverride ?? createToolRegistry(
    toolPackages.flatMap(p => p.tools),
  );

  // Find the memory package by intent
  const memoryPackage = toolPackages.find(
    pkg => pkg.metadata.intent.some(i => i.includes('memory')),
  );

  return {
    async invoke(invocation: AgentInvocation): Promise<AgentInvocationResult> {
      const { message, conversationHistory, identity, stream = true, onTraceEvent } = invocation;
      const allTraceEvents: TraceEvent[] = [];

      function emitTrace(event: TraceEvent): void {
        allTraceEvents.push(event);
        onTraceEvent?.(event);
      }

      // =================================================================
      // MEMORY RECALL — pre-amygdala context injection
      // =================================================================
      let memoryContext: string | undefined;
      if (memoryPackage && 'state' in memoryPackage) {
        try {
          const state = (memoryPackage as any).state;
          const recalledMemories = await state.recall({
            limit: 10,
            includeSuperseded: false,
          });
          if (recalledMemories.length > 0) {
            memoryContext = memoryPackage.formatContext();
            const memoryTypes: Record<string, number> = {};
            for (const m of recalledMemories) {
              memoryTypes[m.type] = (memoryTypes[m.type] ?? 0) + 1;
            }
            emitTrace({
              type: 'memory:recall',
              memoriesRetrieved: recalledMemories.length,
              memoryTypes,
              timestamp: Date.now(),
            } as unknown as TraceEvent);
          }
        } catch {
          // Memory recall failure should not break the pipeline
        }
      }

      // =================================================================
      // AMYGDALA PASS — metacognitive security layer
      // =================================================================
      const amygdalaResult = await amygdala({
        rawMessage: message,
        conversationHistory,
        memoryContext,
        requestMetadata: identity.requestMetadata,
      });

      // Rewrite guard: if amygdala returned a history message as the rewrite
      // instead of transforming the current message, fall back to the raw message.
      if (amygdalaResult.rewrittenPrompt !== message) {
        const historyContents = conversationHistory.map(m => m.content);
        const rewriteMatchesHistory = historyContents.some(
          h => amygdalaResult.rewrittenPrompt === h,
        );
        const currentAppearsInHistory = historyContents.some(
          h => h === message,
        );
        if (rewriteMatchesHistory && !currentAppearsInHistory) {
          amygdalaResult.rewrittenPrompt = message;
        }
      }

      // Notify adapter of threat score (for memory tool gating)
      const threatScore = amygdalaResult.threat?.score ?? 0;
      onThreatScore?.(threatScore);

      // Emit amygdala trace events
      for (const event of amygdalaResult.traceEvents) {
        emitTrace(event as unknown as TraceEvent);
      }

      // =================================================================
      // ORCHESTRATOR — route to subagent with scoped tools
      // =================================================================
      const collector: TraceCollector = {
        onEvent(event: TraceEvent) {
          emitTrace(event);
        },
      };

      const result = await orchestrator({
        amygdalaResult,
        conversationHistory,
        toolRegistry,
        toolPackages,
        trace: collector,
        model,
        maxRounds,
        stream,
        isAdmin: identity.isAdmin,
      });

      // =================================================================
      // Aggregate results
      // =================================================================
      const subagentUsage = result.agentResult.usage;
      const amygdalaUsage = {
        inputTokens: amygdalaResult.usage.inputTokens,
        outputTokens: amygdalaResult.usage.outputTokens,
        cachedTokens: amygdalaResult.usage.cachedTokens ?? 0,
      };

      // Compute content-addressed identity when commitSha is provided
      const agentIdentity = identity.commitSha
        ? await buildAgentIdentity(identity.commitSha, toolPackages, '')
        : undefined;

      return {
        response: result.agentResult.message,
        traceEvents: allTraceEvents,
        usage: {
          inputTokens: amygdalaUsage.inputTokens + subagentUsage.inputTokens,
          outputTokens: amygdalaUsage.outputTokens + subagentUsage.outputTokens,
          cachedTokens: (amygdalaUsage.cachedTokens ?? 0) + (subagentUsage.cachedTokens ?? 0),
        },
        cost: amygdalaResult.cost + result.agentResult.cost,
        subagentId: result.subagentId,
        subagentName: result.subagentName,
        amygdalaUsage,
        amygdalaCost: amygdalaResult.cost,
        agentIdentity,
      };
    },
  };
}
