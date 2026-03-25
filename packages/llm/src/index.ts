export { agent } from './agent';
export type { AgentParams } from './agent';
export { createAgentCore } from './core';
export type {
  AgentCore,
  AgentCoreConfig,
  AgentInvocation,
  AgentInvocationResult,
  AgentCoreFn,
  InvocationIdentity,
} from './core';
export { defineTool, createToolRegistry, createScopedRegistry } from './tool';
export type { ToolDefinition, ToolRegistry, ToolPackage } from './tool';
export { deriveCapabilities, deriveBoundaries, buildSystemPrompt } from './tool/derive';
export type { BuildSystemPromptInput } from './tool/derive';
export type { Message, ToolCall, ToolResult, TokenUsage, AgentResult } from './types';
export type { Trace, Round, ToolExecution, TraceEvent, TraceCollector } from './trace';
export { createTrace } from './trace';
export type { Provider, ProviderCallParams, ProviderCallResult, StreamEvent } from './provider/base';
export { LLMError } from './errors';
export type { LLMErrorCode } from './errors';
// Guardian — canonical exports (new names)
export type {
  GuardianFn,
  GuardianInput,
  GuardianResult,
  Intent,
  GuardianTraceEvent,
  ThreatAssessment,
  ThreatCategory,
  ContextDelegationPlan,
  ContextAnnotation,
  RequestMetadata,
} from './guardian/types';
export { createGuardian } from './guardian';
export type { GuardianConfig } from './guardian';
export { hashForPrivacy } from './guardian/metadata';
// Backwards-compatible re-exports — remove in Phase C
export type {
  AmygdalaFn,
  AmygdalaInput,
  AmygdalaResult,
  AmygdalaIntent,
  AmygdalaTraceEvent,
} from './amygdala/types';
export { createAmygdala } from './amygdala';
export type { AmygdalaConfig } from './amygdala';
export type { SubagentConfig, SubagentRegistry } from './subagent';
export { createSubagentRegistry } from './subagent';
export type {
  OrchestratorFn,
  OrchestratorInput,
  OrchestratorResult,
  OrchestratorTraceEvent,
  OrchestratorRouteEvent,
  OrchestratorContextFilterEvent,
  PromptSource,
} from './orchestrator';
export { createOrchestrator } from './orchestrator';
export type { OrchestratorConfig } from './orchestrator';
export { createJudge } from './eval';
export type { JudgeConfig, JudgeInput, JudgeResult, JudgeScoreEvent, JudgeScores } from './eval';
export { computeIdentity, buildAgentIdentity, getCommitSha, computeToolDiff, buildLineageRecord } from './identity';
export type { AgentIdentity, LineageRecord } from './identity';
export { SLUG_REGEX, BlogFrontmatterSchema } from './blog/types';
export type { BlogPost, BlogPostSummary, BlogFrontmatter } from './blog/types';
export { createSimpleLedger, renderReceipt } from './ledger';
export type {
  Ledger,
  StakeBid,
  StakeReceipt,
  StakeOutcome,
  TransferResult,
  AccountBalance,
} from './ledger';
export { createRouter } from './router';
export type {
  Router,
  RouterOptions,
  ProcessOptions,
  ChannelAdapter,
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  ChannelCapabilities,
  ChannelOrigin,
  UserRef,
  ThreadRef,
  MessageContent,
  Attachment,
  RouterConfig,
  RouterPipelineConfig,
  RouterInput,
  RouterOutput,
} from './router';
export { createWebAdapter } from './router/adapters/web';
export { createCliAdapter } from './router/adapters/cli';
export { createJsonFilePersistentState, formatMemoryContext, MemorySchema, isContradiction } from './memory';
export type {
  PersistentState,
  Memory,
  MemoryType,
  MemoryInput,
  MemoryStats,
  RecallQuery,
  ObservationMemory,
  LearningMemory,
  RelationshipMemory,
  ReflectionMemory,
  Visibility,
} from './memory';
export { createMemoryTools } from './memory/tools';
export { extractMemoryWrites } from './memory/extract';
export { consolidateMemories } from './memory/consolidation';
export type { ConsolidationResult, ConsolidationConfig, ConsolidationLLM } from './memory/consolidation';
