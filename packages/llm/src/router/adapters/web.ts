import type { ChannelAdapter, ChannelCapabilities, ChannelMessage, ChannelResponse } from '../types';

export type WebAdapterConfig = {
  channelId?: string;
};

type WebRawInput = {
  message: string;
  userId?: string;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  sessionId?: string;
};

const WEB_CAPABILITIES: ChannelCapabilities = {
  supportsStreaming: true,
  supportsAttachments: false,
  supportsThreads: true,
  supportsReactions: false,
  supportsFormatting: 'markdown',
};

export function createWebAdapter(config: WebAdapterConfig = {}): ChannelAdapter {
  const channelId = config.channelId ?? 'web-main';

  return {
    type: 'web',
    capabilities: WEB_CAPABILITIES,

    normalize(raw: unknown): ChannelMessage {
      const input = (raw != null && typeof raw === 'object' ? raw : {}) as Partial<WebRawInput>;
      const message = typeof input.message === 'string' ? input.message : '';

      return {
        id: crypto.randomUUID(),
        channel: { type: 'web', id: channelId, capabilities: WEB_CAPABILITIES },
        user: {
          id: input.userId ?? 'anonymous',
          isAdmin: input.isAdmin ?? false,
          isAuthenticated: input.isAuthenticated ?? false,
        },
        thread: input.sessionId ? { id: input.sessionId } : undefined,
        content: { text: message },
        timestamp: Date.now(),
      };
    },

    format(response: ChannelResponse): unknown {
      return {
        response: response.content.text,
        usage: response.usage,
        cost: response.cost,
        subagentId: response.subagentId,
        subagentName: response.subagentName,
      };
    },
  };
}
