import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText, streamText, tool as aiTool } from 'ai';
function convertMessages(messages) {
    return messages
        .filter(m => m.role !== 'system')
        .map(m => {
        if (m.role === 'tool') {
            return {
                role: 'tool',
                content: [{
                        type: 'tool-result',
                        toolCallId: m.toolCallId,
                        toolName: '', // filled by SDK from context
                        output: { type: 'text', value: m.content },
                    }],
            };
        }
        if (m.role === 'assistant' && m.toolCalls?.length) {
            return {
                role: 'assistant',
                content: [
                    ...(m.content ? [{ type: 'text', text: m.content }] : []),
                    ...m.toolCalls.map(tc => ({
                        type: 'tool-call',
                        toolCallId: tc.id,
                        toolName: tc.name,
                        input: tc.arguments,
                    })),
                ],
            };
        }
        return { role: m.role, content: m.content };
    });
}
function convertTools(params) {
    const tools = {};
    for (const t of params.tools) {
        tools[t.name] = aiTool({
            description: t.description,
            inputSchema: t.parameters,
        });
    }
    return tools;
}
function normalizeResult(result) {
    const toolCalls = (result.toolCalls || []).map((tc) => ({
        id: tc.toolCallId,
        name: tc.toolName,
        arguments: tc.input ?? {},
    }));
    return {
        content: result.text ?? '',
        toolCalls,
        usage: {
            inputTokens: result.usage?.inputTokens ?? 0,
            outputTokens: result.usage?.outputTokens ?? 0,
            cachedTokens: result.usage?.cachedInputTokens ?? undefined,
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
export class AnthropicProvider {
    name = 'anthropic';
    client;
    constructor(opts = {}) {
        this.client = createAnthropic({
            apiKey: opts.apiKey ?? process.env.ANTHROPIC_API_KEY,
        });
    }
    /** Prevent API key leakage via JSON.stringify or structured clone */
    toJSON() {
        return { name: this.name };
    }
    /** Prevent API key leakage via string coercion or console.log */
    toString() {
        return `AnthropicProvider`;
    }
    /** Prevent API key leakage via console.log / util.inspect */
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return `AnthropicProvider`;
    }
    async call(params) {
        const messages = convertMessages(params.messages);
        const tools = convertTools(params);
        const result = await generateText({
            model: this.client(params.model),
            system: params.system,
            messages,
            tools: Object.keys(tools).length > 0 ? tools : undefined,
            maxOutputTokens: params.maxTokens,
        });
        return normalizeResult(result);
    }
    async *streamCall(params) {
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
