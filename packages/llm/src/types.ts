/** A message in the conversation. */
export type Message = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
};

/** A tool call requested by the model. */
export type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

/** The result of executing a tool. */
export type ToolResult = {
  toolCallId: string;
  toolName: string;
  result: string;
  error?: string;
};

/** Token usage from a single LLM call. */
export type TokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
};

/** Final result of an agent run. */
export type AgentResult = {
  message: string;
  messages: Message[];
  toolResults: ToolResult[];
  usage: TokenUsage;
  cost: number;
  rounds: number;
  model: string;
  provider: string;
  trace: import('./trace/events').Trace;
};
