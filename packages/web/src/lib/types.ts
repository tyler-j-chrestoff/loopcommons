import type { Round, Trace, ToolExecution } from '@loopcommons/llm';

/** SSE events sent from POST /api/chat to the client */
export type ChatSSEEvent =
  | { type: 'round:start'; round: number; timestamp: number }
  | { type: 'round:complete'; round: Round; timestamp: number }
  | { type: 'tool:start'; toolName: string; input: unknown; timestamp: number }
  | { type: 'tool:complete'; execution: ToolExecution; timestamp: number }
  | { type: 'text-delta'; delta: string; timestamp: number }
  | { type: 'trace:complete'; trace: Trace; timestamp: number }
  | { type: 'error'; error: string; timestamp: number }
  | { type: 'done' };

/** A chat message in the UI */
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  trace?: Trace;
  rounds?: Round[];
  cost?: number;
};
