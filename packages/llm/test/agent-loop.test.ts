import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Provider, ProviderCallResult } from '../src/provider/base';

// Mock the provider module
vi.mock('../src/provider', () => ({
  resolveProvider: vi.fn(),
}));

import { resolveProvider } from '../src/provider';
import { agent } from '../src/agent';
import { defineTool } from '../src/tool';
import { z } from 'zod';
import type { TraceEvent, TraceCollector } from '../src/trace';
import type { Message } from '../src/types';

const mockedResolveProvider = vi.mocked(resolveProvider);

function createMockProvider(responses: ProviderCallResult[]): Provider {
  let callIndex = 0;
  return {
    name: 'mock',
    call: vi.fn(async () => {
      const response = responses[callIndex] ?? responses[responses.length - 1];
      callIndex++;
      return response;
    }),
  };
}

function textResponse(content: string, usage = { inputTokens: 10, outputTokens: 20 }): ProviderCallResult {
  return { content, toolCalls: [], usage };
}

function toolCallResponse(
  calls: { id: string; name: string; arguments: Record<string, unknown> }[],
  content = '',
  usage = { inputTokens: 15, outputTokens: 25 },
): ProviderCallResult {
  return { content, toolCalls: calls, usage };
}

function collectEvents(): { collector: TraceCollector; events: TraceEvent[] } {
  const events: TraceEvent[] = [];
  const collector: TraceCollector = {
    onEvent: (event) => events.push(event),
  };
  return { collector, events };
}

const echoTool = defineTool({
  name: 'echo',
  description: 'Echoes input',
  parameters: z.object({ text: z.string() }),
  execute: async (input) => `echo: ${input.text}`,
});

const userMessages: Message[] = [{ role: 'user', content: 'hello' }];

describe('agent loop', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes with no tools', async () => {
    const provider = createMockProvider([textResponse('Hello back!')]);
    mockedResolveProvider.mockReturnValue(provider);

    const { collector, events } = collectEvents();
    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      trace: collector,
    });

    expect(result.message).toBe('Hello back!');
    expect(result.rounds).toBe(1);
    expect(result.trace.status).toBe('completed');
    expect(result.trace.completedAt).toBeDefined();

    const traceComplete = events.find((e) => e.type === 'trace:complete');
    expect(traceComplete).toBeDefined();
  });

  it('executes single tool call', async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'echo', arguments: { text: 'hi' } }]),
      textResponse('Done!'),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const { collector, events } = collectEvents();
    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [echoTool],
      trace: collector,
    });

    expect(result.message).toBe('Done!');
    expect(result.rounds).toBe(2);
    expect(result.toolResults).toHaveLength(1);
    expect(result.toolResults[0].result).toBe('echo: hi');

    // Verify trace has ToolExecution with timing
    const toolRound = result.trace.rounds[0];
    expect(toolRound.toolExecutions).toHaveLength(1);
    expect(toolRound.toolExecutions[0].toolName).toBe('echo');
    expect(toolRound.toolExecutions[0].startedAt).toBeGreaterThan(0);
    expect(toolRound.toolExecutions[0].completedAt).toBeGreaterThanOrEqual(
      toolRound.toolExecutions[0].startedAt,
    );
    expect(toolRound.toolExecutions[0].latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('executes multiple rounds of tool calls', async () => {
    const toolA = defineTool({
      name: 'toolA',
      description: 'Tool A',
      parameters: z.object({ x: z.number() }),
      execute: async (input) => `A:${input.x}`,
    });
    const toolB = defineTool({
      name: 'toolB',
      description: 'Tool B',
      parameters: z.object({ y: z.string() }),
      execute: async (input) => `B:${input.y}`,
    });

    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'toolA', arguments: { x: 1 } }]),
      toolCallResponse([{ id: 'tc2', name: 'toolB', arguments: { y: 'abc' } }]),
      textResponse('All done'),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [toolA, toolB],
    });

    expect(result.rounds).toBe(3);
    expect(result.trace.rounds).toHaveLength(3);

    // Round 0 executed toolA
    expect(result.trace.rounds[0].toolExecutions).toHaveLength(1);
    expect(result.trace.rounds[0].toolExecutions[0].toolName).toBe('toolA');
    expect(result.trace.rounds[0].toolExecutions[0].output).toBe('A:1');

    // Round 1 executed toolB
    expect(result.trace.rounds[1].toolExecutions).toHaveLength(1);
    expect(result.trace.rounds[1].toolExecutions[0].toolName).toBe('toolB');
    expect(result.trace.rounds[1].toolExecutions[0].output).toBe('B:abc');

    // Round 2 had no tool executions (text response)
    expect(result.trace.rounds[2].toolExecutions).toHaveLength(0);
  });

  it('respects maxRounds', async () => {
    // Provider always returns tool calls
    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'echo', arguments: { text: 'r1' } }]),
      toolCallResponse([{ id: 'tc2', name: 'echo', arguments: { text: 'r2' } }]),
      textResponse('forced final'), // Final call without tools
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [echoTool],
      maxRounds: 2,
    });

    // 2 tool rounds + 1 final forced text round = 3 rounds total
    expect(result.rounds).toBe(3);
    expect(provider.call).toHaveBeenCalledTimes(3);

    // The final call should have been made with empty tools array
    const lastCall = vi.mocked(provider.call).mock.calls[2][0];
    expect(lastCall.tools).toEqual([]);
  });

  it('handles tool execution errors', async () => {
    const failingTool = defineTool({
      name: 'failTool',
      description: 'Always fails',
      parameters: z.object({ input: z.string() }),
      execute: async () => {
        throw new Error('Tool exploded');
      },
    });

    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'failTool', arguments: { input: 'boom' } }]),
      textResponse('Recovered'),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const { collector, events } = collectEvents();
    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [failingTool],
      trace: collector,
    });

    expect(result.message).toBe('Recovered');
    expect(result.rounds).toBe(2);

    // Error captured in ToolExecution
    const execution = result.trace.rounds[0].toolExecutions[0];
    expect(execution.error).toBe('Tool exploded');
    expect(execution.output).toBe('Error: Tool exploded');

    // Tool result also has the error
    expect(result.toolResults[0].error).toBe('Tool exploded');

    // Trace continued to completion
    expect(result.trace.status).toBe('completed');
    const traceComplete = events.find((e) => e.type === 'trace:complete');
    expect(traceComplete).toBeDefined();
  });

  it('emits trace events in order', async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'echo', arguments: { text: 'x' } }]),
      textResponse('done'),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const { collector, events } = collectEvents();
    await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [echoTool],
      trace: collector,
    });

    const types = events.map((e) => e.type);

    // Round 0: round:start, tool:start, tool:complete, round:complete
    // Round 1: round:start, round:complete
    // Then: trace:complete
    expect(types).toEqual([
      'round:start',
      'tool:start',
      'tool:complete',
      'round:complete',
      'round:start',
      'round:complete',
      'trace:complete',
    ]);

    // Timestamps should be non-decreasing
    for (let i = 1; i < events.length; i++) {
      expect(events[i].timestamp).toBeGreaterThanOrEqual(events[i - 1].timestamp);
    }
  });

  it('accumulates token usage across rounds', async () => {
    const provider = createMockProvider([
      toolCallResponse(
        [{ id: 'tc1', name: 'echo', arguments: { text: 'a' } }],
        '',
        { inputTokens: 100, outputTokens: 50 },
      ),
      textResponse('done', { inputTokens: 200, outputTokens: 80 }),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [echoTool],
    });

    expect(result.usage.inputTokens).toBe(300);
    expect(result.usage.outputTokens).toBe(130);
    expect(result.trace.totalUsage.inputTokens).toBe(300);
    expect(result.trace.totalUsage.outputTokens).toBe(130);
  });

  it('trace is fully JSON-serializable', async () => {
    const provider = createMockProvider([
      toolCallResponse([{ id: 'tc1', name: 'echo', arguments: { text: 'test' } }]),
      textResponse('serializable'),
    ]);
    mockedResolveProvider.mockReturnValue(provider);

    const result = await agent({
      model: 'test-model',
      messages: userMessages,
      tools: [echoTool],
    });

    const json = JSON.stringify(result.trace);
    expect(json).toBeDefined();
    expect(typeof json).toBe('string');

    const parsed = JSON.parse(json);
    expect(parsed.model).toBe('test-model');
    expect(parsed.provider).toBe('mock');
    expect(parsed.status).toBe('completed');
    expect(parsed.rounds).toHaveLength(2);
    expect(parsed.totalUsage.inputTokens).toBe(result.usage.inputTokens);
    expect(parsed.totalUsage.outputTokens).toBe(result.usage.outputTokens);
  });
});
