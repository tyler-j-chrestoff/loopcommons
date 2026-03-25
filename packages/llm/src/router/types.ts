import type { TraceEvent } from '../trace/events';
import type { TokenUsage } from '../types';
import type { GuardianResult } from '../guardian/types';
import type { AgentCoreConfig, AgentInvocationResult } from '../core/types';

// ---------------------------------------------------------------------------
// Channel identity
// ---------------------------------------------------------------------------

export type ChannelType = 'web' | 'cli' | 'discord' | 'whatsapp' | 'sms' | 'test';

export type ChannelCapabilities = {
  maxResponseLength?: number;
  supportsStreaming: boolean;
  supportsAttachments: boolean;
  supportsThreads: boolean;
  supportsReactions: boolean;
  supportsFormatting: 'markdown' | 'plaintext' | 'html';
};

export type ChannelOrigin = {
  type: ChannelType;
  id: string;
  capabilities: ChannelCapabilities;
};

// ---------------------------------------------------------------------------
// User and thread references
// ---------------------------------------------------------------------------

export type UserRef = {
  id: string;
  isAdmin: boolean;
  isAuthenticated: boolean;
};

export type ThreadRef = {
  id: string;
};

// ---------------------------------------------------------------------------
// Message content
// ---------------------------------------------------------------------------

export type Attachment = {
  type: 'image' | 'file' | 'audio' | 'video';
  url: string;
  mimeType?: string;
  name?: string;
};

export type MessageContent = {
  text: string;
  attachments?: Attachment[];
};

// ---------------------------------------------------------------------------
// Canonical message — the Router normalizes every channel into this
// ---------------------------------------------------------------------------

export type ChannelMessage = {
  id: string;
  channel: ChannelOrigin;
  user: UserRef;
  thread?: ThreadRef;
  content: MessageContent;
  timestamp: number;
};

// ---------------------------------------------------------------------------
// Canonical response — Router formats this back to channel-specific shape
// ---------------------------------------------------------------------------

export type ChannelResponse = {
  messageId: string;
  content: MessageContent;
  traceEvents: TraceEvent[];
  usage: TokenUsage;
  cost: number;
  subagentId: string;
  subagentName: string;
  guardianAssessment: GuardianResult;
  receipts?: import('../ledger/types').StakeReceipt[];
};

// ---------------------------------------------------------------------------
// Channel adapter — each channel implements this
// ---------------------------------------------------------------------------

export type ChannelAdapter = {
  type: ChannelType;
  capabilities: ChannelCapabilities;
  normalize(raw: unknown): ChannelMessage;
  format(response: ChannelResponse): unknown;
};

// ---------------------------------------------------------------------------
// Router configuration and I/O
// ---------------------------------------------------------------------------

export type RouterPipelineConfig = Pick<AgentCoreConfig, 'toolPackages'> &
  Partial<Pick<AgentCoreConfig, 'amygdala' | 'orchestrator' | 'toolRegistry' | 'model' | 'maxRounds' | 'onThreatScore'>>;

export type RouterConfig = {
  adapters: ChannelAdapter[];
  pipeline: RouterPipelineConfig;
};

export type RouterInput = {
  raw: unknown;
  channelType: ChannelType;
};

export type RouterOutput = {
  response: ChannelResponse;
  channelFormatted: unknown;
  /** Raw core result — allows callers to access amygdala-specific fields
   *  (amygdalaUsage, amygdalaCost, agentIdentity) during Phase A migration. */
  coreResult: AgentInvocationResult;
};
