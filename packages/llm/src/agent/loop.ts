import type { Message, ToolResult, TokenUsage, AgentResult } from '../types';
import type { ToolDefinition } from '../tool';
import { createToolRegistry } from '../tool';
import type { Trace, Round, ToolExecution, TraceCollector, TraceEvent } from '../trace';
import { createTrace } from '../trace';
import type { ProviderCallResult } from '../provider/base';
import { resolveProvider } from '../provider';
import { LLMError } from '../errors';
import { createThinkingFilter, stripThinkingTags } from './thinking-filter';

/** Parameters for the agent function */
export type AgentParams = {
  model: string;
  system?: string;
  messages: Message[];
  tools?: ToolDefinition[];
  maxRounds?: number;
  trace?: TraceCollector | TraceCollector[];
  /** Enable token-by-token streaming. text-delta events are emitted via collectors. */
  stream?: boolean;
};

/** Emit a trace event to all collectors */
function emit(collectors: TraceCollector[], event: TraceEvent): void {
  for (const c of collectors) {
    c.onEvent(event);
  }
}

/** Clamp token usage values to non-negative integers */
function clampUsage(usage: TokenUsage): TokenUsage {
  const clamp = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
  return {
    inputTokens: clamp(usage.inputTokens),
    outputTokens: clamp(usage.outputTokens),
    ...(usage.cachedTokens != null ? { cachedTokens: clamp(usage.cachedTokens) } : {}),
  };
}

/** Pricing per million tokens by model prefix. Cached input is discounted. */
const PRICING: Record<string, { input: number; cached: number; output: number }> = {
  'claude-haiku-4-5':  { input: 1.00, cached: 0.10, output: 5.00 },
  'claude-sonnet-4-5': { input: 3.00, cached: 0.30, output: 15.00 },
  'claude-opus-4':     { input: 15.00, cached: 1.50, output: 75.00 },
};

function resolvePricing(model: string) {
  for (const prefix of Object.keys(PRICING)) {
    if (model.startsWith(prefix)) return PRICING[prefix];
  }
  return PRICING['claude-haiku-4-5']; // fallback
}

/** Calculate cost for a given usage, accounting for cached tokens. */
function calculateCost(usage: TokenUsage, model: string): number {
  const p = resolvePricing(model);
  const cached = usage.cachedTokens ?? 0;
  const uncached = usage.inputTokens - cached;
  return (uncached * p.input + cached * p.cached + usage.outputTokens * p.output) / 1_000_000;
}

/** Call provider with optional streaming. Emits text-delta events when streaming. */
async function callProvider(
  provider: ReturnType<typeof resolveProvider>,
  params: AgentParams,
  tools: ToolDefinition[],
  collectors: TraceCollector[],
  useStreaming: boolean,
): Promise<ProviderCallResult> {
  const callParams = {
    model: params.model,
    system: params.system,
    messages: params.messages,
    tools,
  };

  if (useStreaming && provider.streamCall) {
    let result: ProviderCallResult | undefined;
    const thinkingFilter = createThinkingFilter();
    for await (const event of provider.streamCall(callParams)) {
      if (event.type === 'text-delta') {
        for (const chunk of thinkingFilter.push(event.delta)) {
          emit(collectors, { type: 'text-delta', delta: chunk, timestamp: Date.now() });
        }
      } else if (event.type === 'finish') {
        // Flush any remaining buffered content
        for (const chunk of thinkingFilter.flush()) {
          emit(collectors, { type: 'text-delta', delta: chunk, timestamp: Date.now() });
        }
        result = event.result;
      }
    }
    if (!result) throw new LLMError('PROVIDER_ERROR', 'Stream ended without finish event');
    return result;
  }

  return provider.call(callParams);
}

const MAX_ROUNDS_LIMIT = 100;

/** Run an agent loop: call the model, execute tools, repeat until done */
export async function agent(params: AgentParams): Promise<AgentResult> {
  const rawMaxRounds = params.maxRounds ?? 5;
  if (!Number.isFinite(rawMaxRounds) || rawMaxRounds < 1) {
    throw new LLMError('MAX_ROUNDS_EXCEEDED', `maxRounds must be a finite positive integer, got ${rawMaxRounds}`);
  }
  const maxRounds = Math.min(Math.floor(rawMaxRounds), MAX_ROUNDS_LIMIT);
  const collectors: TraceCollector[] = params.trace
    ? Array.isArray(params.trace) ? params.trace : [params.trace]
    : [];

  const provider = resolveProvider(params.model);
  const registry = createToolRegistry(params.tools ?? []);
  const trace = createTrace(params.model, provider.name, { system: params.system, maxRounds });
  const useStreaming = params.stream ?? false;

  // Copy messages — don't mutate caller's array
  const messages: Message[] = [...params.messages];
  // Build a mutable params copy for callProvider (messages are updated in-place)
  const mutableParams = { ...params, messages };
  const allToolResults: ToolResult[] = [];
  let lastContent = '';

  for (let round = 0; round < maxRounds; round++) {
    const roundStartedAt = Date.now();
    emit(collectors, { type: 'round:start', round, timestamp: roundStartedAt });

    // Call the provider (streaming emits text-delta events)
    const result = await callProvider(provider, mutableParams, params.tools ?? [], collectors, useStreaming);

    const roundLatency = Date.now() - roundStartedAt;
    result.usage = clampUsage(result.usage);
    result.content = stripThinkingTags(result.content);
    const roundCost = calculateCost(result.usage, params.model);
    lastContent = result.content;

    // Append assistant message
    const assistantMessage: Message = {
      role: 'assistant',
      content: result.content,
      ...(result.toolCalls.length > 0 ? { toolCalls: result.toolCalls } : {}),
    };
    messages.push(assistantMessage);

    // If no tool calls, we're done
    if (result.toolCalls.length === 0) {
      const completedAt = Date.now();
      const roundObj: Round = {
        index: round,
        startedAt: roundStartedAt,
        completedAt,
        latencyMs: roundLatency,
        request: { messages: [...messages.slice(0, -1)], toolNames: registry.list() },
        response: { content: result.content, toolCalls: [], usage: result.usage, cost: roundCost, finishReason: result.finishReason, rawResponse: result.rawResponse },
        toolExecutions: [],
      };
      trace.rounds.push(roundObj);
      trace.totalUsage.inputTokens += result.usage.inputTokens;
      trace.totalUsage.outputTokens += result.usage.outputTokens;
      trace.totalUsage.cachedTokens = (trace.totalUsage.cachedTokens ?? 0) + (result.usage.cachedTokens ?? 0);
      trace.totalCost += roundCost;
      emit(collectors, { type: 'round:complete', round: roundObj, timestamp: completedAt });
      break;
    }

    // Execute tool calls in parallel
    // SECURITY: Tool outputs are inserted into the conversation as-is. A tool that returns
    // adversarial text (e.g., "ignore previous instructions...") could influence the model's
    // next response. This is an inherent risk of tool-use loops. Mitigations belong at the
    // application layer (output validation, sandboxing tool implementations, system-prompt
    // hardening) rather than here in the generic agent loop.
    const toolPromises = result.toolCalls.map(async (tc) => {
      const toolStartedAt = Date.now();
      emit(collectors, { type: 'tool:start', toolName: tc.name, input: tc.arguments, timestamp: toolStartedAt });

      let output = '';
      let error: string | undefined;

      const toolDef = registry.get(tc.name);
      if (!toolDef) {
        error = `Unknown tool: ${tc.name}`;
        output = error;
      } else {
        try {
          const raw = await toolDef.execute(tc.arguments);
          output = raw == null ? '' : String(raw);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e ?? 'Unknown error');
          output = `Error: ${error}`;
        }
      }

      const toolCompletedAt = Date.now();
      const execution: ToolExecution = {
        toolCallId: tc.id,
        toolName: tc.name,
        input: tc.arguments,
        output,
        error,
        startedAt: toolStartedAt,
        completedAt: toolCompletedAt,
        latencyMs: toolCompletedAt - toolStartedAt,
      };
      emit(collectors, { type: 'tool:complete', execution, timestamp: toolCompletedAt });

      return { execution, toolCall: tc, output, error };
    });

    const toolResults = await Promise.allSettled(toolPromises);
    const toolExecutions: ToolExecution[] = [];

    // Process results in original order to maintain deterministic message ordering
    for (const settled of toolResults) {
      // Promise.allSettled never rejects individual promises here (we catch inside),
      // but handle it defensively
      if (settled.status === 'rejected') continue;
      const { execution, toolCall: tc, output, error } = settled.value;

      toolExecutions.push(execution);
      allToolResults.push({
        toolCallId: tc.id,
        toolName: tc.name,
        result: output,
        error,
      });
      messages.push({
        role: 'tool',
        content: output,
        toolCallId: tc.id,
      });
    }

    // Build round
    const roundCompletedAt = Date.now();
    const roundObj: Round = {
      index: round,
      startedAt: roundStartedAt,
      completedAt: roundCompletedAt,
      latencyMs: roundCompletedAt - roundStartedAt,
      request: { messages: [...messages.slice(0, -(result.toolCalls.length + 1))], toolNames: registry.list() },
      response: { content: result.content, toolCalls: result.toolCalls, usage: result.usage, cost: roundCost, finishReason: result.finishReason, rawResponse: result.rawResponse },
      toolExecutions,
    };
    trace.rounds.push(roundObj);
    trace.totalUsage.inputTokens += result.usage.inputTokens;
    trace.totalUsage.outputTokens += result.usage.outputTokens;
    trace.totalUsage.cachedTokens = (trace.totalUsage.cachedTokens ?? 0) + (result.usage.cachedTokens ?? 0);
    trace.totalCost += roundCost;
    emit(collectors, { type: 'round:complete', round: roundObj, timestamp: roundCompletedAt });

    // If this was the last round and we still have tool calls, do one more call without tools
    if (round === maxRounds - 1) {
      const finalStartedAt = Date.now();
      emit(collectors, { type: 'round:start', round: round + 1, timestamp: finalStartedAt });

      const finalResult = await callProvider(provider, mutableParams, [], collectors, useStreaming);

      const finalLatency = Date.now() - finalStartedAt;
      finalResult.usage = clampUsage(finalResult.usage);
      const finalCost = calculateCost(finalResult.usage, params.model);
      lastContent = finalResult.content;

      messages.push({ role: 'assistant', content: finalResult.content });

      const finalRound: Round = {
        index: round + 1,
        startedAt: finalStartedAt,
        completedAt: Date.now(),
        latencyMs: finalLatency,
        request: { messages: [...messages.slice(0, -1)], toolNames: [] },
        response: { content: finalResult.content, toolCalls: [], usage: finalResult.usage, cost: finalCost, finishReason: finalResult.finishReason, rawResponse: finalResult.rawResponse },
        toolExecutions: [],
      };
      trace.rounds.push(finalRound);
      trace.totalUsage.inputTokens += finalResult.usage.inputTokens;
      trace.totalUsage.outputTokens += finalResult.usage.outputTokens;
      trace.totalUsage.cachedTokens = (trace.totalUsage.cachedTokens ?? 0) + (finalResult.usage.cachedTokens ?? 0);
      trace.totalCost += finalCost;
      emit(collectors, { type: 'round:complete', round: finalRound, timestamp: Date.now() });
    }
  }

  // Complete trace
  trace.completedAt = Date.now();
  trace.status = 'completed';
  emit(collectors, { type: 'trace:complete', trace, timestamp: Date.now() });

  if (!lastContent && allToolResults.length === 0) {
    lastContent = '[empty response]';
  }

  return {
    message: lastContent,
    messages,
    toolResults: allToolResults,
    usage: trace.totalUsage,
    cost: trace.totalCost,
    rounds: trace.rounds.length,
    model: params.model,
    provider: provider.name,
    trace,
  };
}
