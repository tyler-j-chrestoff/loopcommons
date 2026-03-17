import type { Message, AgentResult } from '../types';
import type { ToolDefinition } from '../tool';
import type { TraceCollector } from '../trace';
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
/** Run an agent loop: call the model, execute tools, repeat until done */
export declare function agent(params: AgentParams): Promise<AgentResult>;
