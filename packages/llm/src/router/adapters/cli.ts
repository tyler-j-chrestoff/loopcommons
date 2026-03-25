import type { ChannelAdapter, ChannelCapabilities, ChannelMessage, ChannelResponse } from '../types';

type CliRawInput = {
  message: string;
  isAdmin?: boolean;
  sessionId?: string;
};

const CLI_CAPABILITIES: ChannelCapabilities = {
  supportsStreaming: true,
  supportsAttachments: false,
  supportsThreads: true,
  supportsReactions: false,
  supportsFormatting: 'markdown',
};

export function createCliAdapter(): ChannelAdapter {
  return {
    type: 'cli',
    capabilities: CLI_CAPABILITIES,

    normalize(raw: unknown): ChannelMessage {
      const input = (raw != null && typeof raw === 'object' ? raw : {}) as Partial<CliRawInput>;
      const message = typeof input.message === 'string' ? input.message : '';

      return {
        id: crypto.randomUUID(),
        channel: { type: 'cli', id: 'cli-local', capabilities: CLI_CAPABILITIES },
        user: {
          id: 'cli-user',
          isAdmin: input.isAdmin ?? false,
          isAuthenticated: true,
        },
        thread: input.sessionId ? { id: input.sessionId } : undefined,
        content: { text: message },
        timestamp: Date.now(),
      };
    },

    format(response: ChannelResponse): unknown {
      return {
        text: response.content.text,
        subagentName: response.subagentName,
        tokens: response.usage.inputTokens + response.usage.outputTokens,
        cost: response.cost,
      };
    },
  };
}
