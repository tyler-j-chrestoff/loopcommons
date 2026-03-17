import type { Message, ToolCall, TokenUsage } from '../types';
import type { ToolDefinition } from '../tool';
export type ProviderCallParams = {
    model: string;
    system?: string;
    messages: Message[];
    tools: ToolDefinition[];
    maxTokens?: number;
};
export type ProviderCallResult = {
    content: string;
    toolCalls: ToolCall[];
    usage: TokenUsage;
    finishReason: string;
    rawResponse: unknown;
};
/** Events emitted during streaming */
export type StreamEvent = {
    type: 'text-delta';
    delta: string;
} | {
    type: 'finish';
    result: ProviderCallResult;
};
export interface Provider {
    name: string;
    call(params: ProviderCallParams): Promise<ProviderCallResult>;
    streamCall?(params: ProviderCallParams): AsyncIterable<StreamEvent>;
}
