import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool as aiTool } from 'ai';
import type { Provider, ProviderCallParams, ProviderCallResult, StreamEvent } from './base';
import type { Message } from '../types';

function convertMessages(messages: Message[]) {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'tool' as const,
          content: [{
            type: 'tool-result' as const,
            toolCallId: m.toolCallId!,
            toolName: '', // filled by SDK from context
            output: { type: 'text' as const, value: m.content },
          }],
        };
      }
      if (m.role === 'assistant' && m.toolCalls?.length) {
        return {
          role: 'assistant' as const,
          content: [
            ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
            ...m.toolCalls.map(tc => ({
              type: 'tool-call' as const,
              toolCallId: tc.id,
              toolName: tc.name,
              input: tc.arguments,
            })),
          ],
        };
      }
      return { role: m.role as 'user' | 'assistant', content: m.content };
    });
}

function convertTools(params: ProviderCallParams): Record<string, any> {
  const tools: Record<string, any> = {};
  for (const t of params.tools) {
    tools[t.name] = aiTool({
      description: t.description,
      inputSchema: t.parameters,
    });
  }
  return tools;
}

function extractCachedTokens(usage: any): number | undefined {
  // v6 moved cached tokens to inputTokenDetails.cacheReadTokens; fall back to deprecated cachedInputTokens
  return usage?.inputTokenDetails?.cacheReadTokens ?? usage?.cachedInputTokens ?? undefined;
}

function normalizeResult(result: { text?: string; toolCalls?: any[]; usage?: any; finishReason?: string; response?: any; warnings?: any }): ProviderCallResult {
  const toolCalls = (result.toolCalls || []).map((tc: any) => ({
    id: tc.toolCallId,
    name: tc.toolName,
    arguments: tc.input as Record<string, unknown> ?? {},
  }));

  return {
    content: result.text ?? '',
    toolCalls,
    usage: {
      inputTokens: result.usage?.inputTokens ?? 0,
      outputTokens: result.usage?.outputTokens ?? 0,
      cachedTokens: extractCachedTokens(result.usage),
    },
    finishReason: result.finishReason ?? 'unknown',
    rawResponse: {
      headers: result.response?.headers,
      body: result.response?.body,
      usage: result.usage,
      finishReason: result.finishReason,
      warnings: result.warnings,
    },
  };
}

export class AnthropicProvider implements Provider {
  name = 'anthropic';
  private client: ReturnType<typeof createAnthropic>;

  constructor(opts: { apiKey?: string } = {}) {
    this.client = createAnthropic({
      apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
    });
  }

  /** Prevent API key leakage via JSON.stringify or structured clone */
  toJSON(): { name: string } {
    return { name: this.name };
  }

  /** Prevent API key leakage via string coercion or console.log */
  toString(): string {
    return `AnthropicProvider`;
  }

  /** Prevent API key leakage via console.log / util.inspect */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return `AnthropicProvider`;
  }

  async call(params: ProviderCallParams): Promise<ProviderCallResult> {
    const messages = convertMessages(params.messages);
    const tools = convertTools(params);

    const result = await generateText({
      model: this.client(params.model),
      system: params.system,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      maxOutputTokens: params.maxTokens,
    });

    return normalizeResult(result as any);
  }

  async *streamCall(params: ProviderCallParams): AsyncIterable<StreamEvent> {
    const messages = convertMessages(params.messages);
    const tools = convertTools(params);

    const stream = streamText({
      model: this.client(params.model),
      system: params.system,
      messages,
      tools: Object.keys(tools).length > 0 ? tools : undefined,
      maxOutputTokens: params.maxTokens,
    });

    for await (const chunk of stream.textStream) {
      if (chunk) {
        yield { type: 'text-delta', delta: chunk };
      }
    }

    // After textStream completes, get final result
    const finalUsage = await stream.usage;
    const finalFinishReason = await stream.finishReason;
    const finalToolCalls = await stream.toolCalls;
    const finalText = await stream.text;
    const finalResponse = await stream.response;

    yield {
      type: 'finish',
      result: normalizeResult({
        text: finalText,
        toolCalls: finalToolCalls,
        usage: finalUsage,
        finishReason: finalFinishReason,
        response: finalResponse,
      }),
    };
  }
}
