import type { TokenUsage, ToolCall, Message } from '../types';
export type Trace = {
    id: string;
    startedAt: number;
    completedAt?: number;
    model: string;
    provider: string;
    system?: string;
    config: {
        maxRounds: number;
    };
    rounds: Round[];
    totalUsage: TokenUsage;
    totalCost: number;
    status: 'running' | 'completed' | 'error';
    error?: string;
};
export type Round = {
    index: number;
    startedAt: number;
    completedAt: number;
    latencyMs: number;
    request: {
        messages: Message[];
        toolNames: string[];
    };
    response: {
        content: string;
        toolCalls: ToolCall[];
        usage: TokenUsage;
        cost: number;
        finishReason: string;
        rawResponse: unknown;
    };
    toolExecutions: ToolExecution[];
};
export type ToolExecution = {
    toolCallId: string;
    toolName: string;
    input: Record<string, unknown>;
    output: string;
    error?: string;
    startedAt: number;
    completedAt: number;
    latencyMs: number;
};
export type TraceEvent = {
    type: 'round:start';
    round: number;
    timestamp: number;
} | {
    type: 'round:complete';
    round: Round;
    timestamp: number;
} | {
    type: 'tool:start';
    toolName: string;
    input: unknown;
    timestamp: number;
} | {
    type: 'tool:complete';
    execution: ToolExecution;
    timestamp: number;
} | {
    type: 'text-delta';
    delta: string;
    timestamp: number;
} | {
    type: 'trace:complete';
    trace: Trace;
    timestamp: number;
} | {
    type: 'error';
    error: string;
    timestamp: number;
};
export type TraceCollector = {
    onEvent: (event: TraceEvent) => void;
};
