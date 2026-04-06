import type { Message } from '../types';
import type { TraceEvent } from '../trace/events';
import type { AgentCore, AgentInvocationResult, InvocationIdentity } from '../core/types';
import type { Ledger, StakeReceipt } from '../ledger/types';
import type { IdentityStore } from '../user-identity/types';
import type {
  ChannelAdapter,
  ChannelMessage,
  ChannelResponse,
  ChannelType,
  RouterInput,
  RouterOutput,
} from './types';

export type { ChannelAdapter, ChannelMessage, ChannelResponse, ChannelType, RouterInput, RouterOutput } from './types';
export type { ChannelCapabilities, ChannelOrigin, UserRef, ThreadRef, MessageContent, Attachment, RouterConfig, RouterPipelineConfig } from './types';
export { createWebAdapter } from './adapters/web';
export { createCliAdapter } from './adapters/cli';
export { createTestAdapter } from './adapters/test';
export { createSmsAdapter, validateTwilioSignature } from './adapters/sms';
export type { IdentityStore } from '../user-identity/types';
export { createInMemoryIdentityStore } from '../user-identity/in-memory-store';

export type RouterOptions = {
  adapters: ChannelAdapter[];
  core: AgentCore;
  ledger?: Ledger;
  identityStore?: IdentityStore;
};

export type ProcessOptions = {
  stream?: boolean;
  onTraceEvent?: (event: TraceEvent) => void;
  /** Caller-provided conversation history. When set, overrides Router's internal
   *  thread history. Used by stateless channels (web) where the client sends
   *  full history with each request. */
  conversationHistory?: Message[];
  /** Additional identity fields to merge (requestMetadata, commitSha, etc.).
   *  Router derives interfaceId/isAdmin/isAuthenticated from the ChannelMessage;
   *  this allows callers to add transport-layer metadata. */
  identityOverrides?: Partial<InvocationIdentity>;
};

export type Router = {
  process(input: RouterInput, options?: ProcessOptions): Promise<RouterOutput>;
  getAdapter(type: ChannelType): ChannelAdapter | undefined;
};

const ROUTER_STAKE_AMOUNT = 10;
const ROUTER_STAKE_TIMEOUT = 60;

export function createRouter(options: RouterOptions): Router {
  const { adapters, core, ledger, identityStore } = options;

  const adapterMap = new Map<ChannelType, ChannelAdapter>();
  for (const adapter of adapters) {
    adapterMap.set(adapter.type, adapter);
  }

  // Per-thread conversation history (used when caller doesn't provide history)
  const threadHistory = new Map<string, Message[]>();

  return {
    async process(input: RouterInput, processOptions?: ProcessOptions): Promise<RouterOutput> {
      const adapter = adapterMap.get(input.channelType);
      if (!adapter) {
        throw new Error(`No adapter registered for channel type: ${input.channelType}`);
      }

      // Normalize raw input into canonical ChannelMessage
      const channelMessage = adapter.normalize(input.raw);

      // Resolve conversation history: caller-provided > thread-managed > empty
      let history: Message[];
      if (processOptions?.conversationHistory !== undefined) {
        history = processOptions.conversationHistory;
      } else {
        const threadId = channelMessage.thread?.id;
        history = threadId ? (threadHistory.get(threadId) ?? []) : [];
      }

      // Build identity from channel message + optional overrides
      let resolvedUserId = channelMessage.user.id;
      let resolvedIsAdmin = channelMessage.user.isAdmin;

      if (identityStore) {
        const userIdentity = await identityStore.resolve(
          channelMessage.channel.type,
          channelMessage.user.id,
        );
        resolvedUserId = userIdentity.id;
        if (userIdentity.adminStatus) {
          resolvedIsAdmin = true;
        }
      }

      const identity: InvocationIdentity = {
        interfaceId: channelMessage.channel.type,
        isAdmin: resolvedIsAdmin,
        isAuthenticated: channelMessage.user.isAuthenticated,
        userId: resolvedUserId,
        ...processOptions?.identityOverrides,
      };

      // Stake energy for normalize + dispatch (if ledger present)
      let routerReceipt: StakeReceipt | undefined;
      if (ledger) {
        routerReceipt = await ledger.stake({
          subsystemId: 'router',
          amount: ROUTER_STAKE_AMOUNT,
          purpose: 'normalize + dispatch',
          timeout: ROUTER_STAKE_TIMEOUT,
          correlationId: channelMessage.id,
        });
      }

      // Call the agent core pipeline
      const coreResult = await core.invoke({
        message: channelMessage.content.text,
        conversationHistory: history,
        identity,
        stream: processOptions?.stream,
        onTraceEvent: processOptions?.onTraceEvent,
        channelCapabilities: channelMessage.channel.capabilities,
        channelMessage,
      });

      // Resolve router stake
      const receipts: StakeReceipt[] = [];
      if (ledger && routerReceipt) {
        await ledger.resolve(routerReceipt, { quality: 1.0 });
        receipts.push(routerReceipt);
      }

      // Update thread history (only when Router manages history)
      if (processOptions?.conversationHistory === undefined) {
        const threadId = channelMessage.thread?.id;
        if (threadId) {
          const updated = [
            ...history,
            { role: 'user' as const, content: channelMessage.content.text },
            { role: 'assistant' as const, content: coreResult.response },
          ];
          threadHistory.set(threadId, updated);
        }
      }

      // Build canonical response
      const channelResponse: ChannelResponse = {
        messageId: channelMessage.id,
        content: { text: coreResult.response },
        traceEvents: coreResult.traceEvents,
        usage: coreResult.usage,
        cost: coreResult.cost,
        subagentId: coreResult.subagentId,
        subagentName: coreResult.subagentName,
        guardianAssessment: {
          rewrittenPrompt: '',
          intent: 'conversation',
          threat: { score: 0, category: 'none', reasoning: '' },
          veto: false,
          contextDelegation: { historyIndices: [], annotations: [] },
          traceEvents: [],
          latencyMs: 0,
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
          cost: 0,
        },
        ...(receipts.length > 0 ? { receipts } : {}),
      };

      // Touch identity to update lastSeenAt
      if (identityStore) {
        await identityStore.touch(resolvedUserId);
      }

      // Format for the channel
      const channelFormatted = adapter.format(channelResponse);

      return { response: channelResponse, channelFormatted, coreResult };
    },

    getAdapter(type: ChannelType): ChannelAdapter | undefined {
      return adapterMap.get(type);
    },
  };
}
