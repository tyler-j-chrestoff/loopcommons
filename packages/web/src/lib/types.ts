import type { Round, Trace, ToolExecution, AmygdalaIntent, ThreatCategory, JudgeScores, Memory, AgentIdentity } from '@loopcommons/llm';
import type { BudgetSnapshot } from '@/lib/token-budget';
import type { FeedbackRating, FeedbackCategory } from '@/lib/feedback';

/** SSE events sent from POST /api/chat to the client */
export type ChatSSEEvent =
  // --- Agent loop events ---
  | { type: 'round:start'; round: number; timestamp: number }
  | { type: 'round:complete'; round: Round; timestamp: number }
  | { type: 'tool:start'; toolName: string; input: unknown; timestamp: number }
  | { type: 'tool:complete'; execution: ToolExecution; timestamp: number }
  | { type: 'text-delta'; delta: string; timestamp: number }
  | { type: 'trace:complete'; trace: Trace; timestamp: number }
  | { type: 'error'; error: string; timestamp: number }
  // --- Infrastructure events ---
  | { type: 'rate-limit:status'; remaining: number; limit: number; activeConnections: number; concurrencyLimit: number; resetMs: number; timestamp: number }
  | { type: 'spend:status'; currentSpendUsd: number; dailyCapUsd: number; remainingUsd: number; percentUsed: number; resetAtUtc: string; timestamp: number }
  | { type: 'security:input-sanitized'; reason: string; timestamp: number }
  | { type: 'security:input-rejected'; reason: string; timestamp: number }
  // --- Amygdala events (metacognitive security layer) ---
  | { type: 'amygdala:rewrite'; originalPrompt: string; rewrittenPrompt: string; modified: boolean; timestamp: number }
  | { type: 'amygdala:classify'; intent: AmygdalaIntent; confidence: number; timestamp: number }
  | { type: 'amygdala:threat-assess'; threat: { score: number; category: ThreatCategory; reasoning: string }; timestamp: number }
  | { type: 'amygdala:context-delegate'; plan: { historyIndices: number[]; contextSummary?: string; annotations: Array<{ key: string; value: string }> }; totalMessages: number; delegatedMessages: number; timestamp: number }
  // --- Orchestrator events (routing + context filtering) ---
  | { type: 'orchestrator:route'; subagentId: string; subagentName: string; intent: AmygdalaIntent; threatOverride: boolean; threatScore: number; allowedTools: string[]; promptSource: 'static' | 'derived' | 'hybrid'; reasoning: string; timestamp: number }
  | { type: 'orchestrator:context-filter'; totalMessages: number; delegatedMessages: number; deliveredMessages: number; usedSummary: boolean; annotations: Array<{ key: string; value: string }>; timestamp: number }
  // --- Token budget events ---
  | { type: 'token-budget:update'; timestamp: number } & BudgetSnapshot
  // --- Eval events ---
  | { type: 'eval:feedback'; messageId: string; sessionId: string; rating: FeedbackRating; category?: FeedbackCategory; timestamp: number }
  | { type: 'eval:score'; messageId: string; sessionId: string; scores: JudgeScores; model: string; latencyMs: number; cost: { inputTokens: number; outputTokens: number }; timestamp: number }
  // --- Memory events ---
  | { type: 'memory:recall'; memoriesRetrieved: number; memoryTypes: Record<string, number>; timestamp: number }
  | { type: 'memory:write'; memory: Memory; gatedBy: number; deduplication: 'new' | 'reinforced' | 'updated'; timestamp: number }
  // --- Session events ---
  | { type: 'session:start'; sessionId: string; parentSessionId?: string; interfaceId?: string; agentIdentity?: AgentIdentity; timestamp: number }
  | { type: 'session:complete'; sessionId: string; timestamp: number }
  // --- Terminal ---
  | { type: 'done' };

/** Amygdala classification result attached to a message for UI display */
export type AmygdalaClassification = {
  intent: AmygdalaIntent;
  confidence: number;
  threatScore: number;
  threatCategory: ThreatCategory;
  threatReasoning: string;
  rewriteModified: boolean;
  originalPrompt?: string;
  rewrittenPrompt?: string;
  latencyMs?: number;
};

/** Orchestrator routing decision attached to a message for UI display */
export type RoutingDecision = {
  subagentId: string;
  subagentName: string;
  threatOverride: boolean;
  allowedTools: string[];
  promptSource: 'static' | 'derived' | 'hybrid';
  reasoning: string;
  /** Context filtering stats */
  totalMessages: number;
  delegatedMessages: number;
  deliveredMessages: number;
  usedSummary: boolean;
};

/** User feedback on an assistant message */
export type MessageFeedback = {
  rating: FeedbackRating;
  category?: FeedbackCategory;
};

/** Memory activity for a single interaction */
export type MemoryActivity = {
  /** Number of memories recalled before amygdala pass */
  memoriesRetrieved: number;
  /** Count by type */
  memoryTypes: Record<string, number>;
  /** Memories written after interaction */
  memoriesWritten: MemoryWriteInfo[];
};

export type MemoryWriteInfo = {
  memory: Memory;
  gatedBy: number;
  deduplication: 'new' | 'reinforced' | 'updated';
};

/** A single calibration iteration from the auto-calibration JSONL log */
export type CalibrationIteration = {
  iteration: number;
  timestamp: string;
  proposedEdit: string | null;
  diff: string | null;
  metricsBefore: { detectionRate: number; fpRate: number; simplicity: number; costEfficiency: number } | null;
  metricsAfter: { detectionRate: number; fpRate: number; simplicity: number; costEfficiency: number };
  fitnessScore: number;
  decision: 'baseline' | 'kept' | 'reverted';
};

/** A segment of an assistant message — text or tool calls, in stream order */
export type MessageSegment =
  | { type: 'text'; content: string }
  | { type: 'tool-call'; executions: ToolExecution[] };

/** A chat message in the UI */
export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  /** Ordered segments for inline rendering (text + tool calls interleaved) */
  segments?: MessageSegment[];
  trace?: Trace;
  rounds?: Round[];
  cost?: number;
  /** Amygdala classification for this message (user messages only) */
  amygdala?: AmygdalaClassification;
  /** Routing decision for this message (user messages only) */
  routing?: RoutingDecision;
  /** Session ID for this conversation */
  sessionId?: string;
  /** User feedback (assistant messages only) */
  feedback?: MessageFeedback;
  /** LLM-as-judge scores (assistant messages only) */
  judgeScores?: JudgeScores;
  /** Memory activity for this interaction */
  memory?: MemoryActivity;
};
