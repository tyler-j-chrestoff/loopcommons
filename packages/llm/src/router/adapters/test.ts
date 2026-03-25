/**
 * TestAdapter — programmatic ChannelAdapter for integration tests.
 *
 * Simulates a second channel without external dependencies.
 * Configurable capabilities for testing different channel constraints.
 */

import type { ChannelAdapter, ChannelCapabilities, ChannelMessage, ChannelResponse } from '../types';

type TestAdapterOptions = Partial<ChannelCapabilities>;

type TestAdapterRaw = {
  message: string;
  userId?: string;
  isAdmin?: boolean;
  isAuthenticated?: boolean;
  sessionId?: string;
};

export function createTestAdapter(options: TestAdapterOptions = {}): ChannelAdapter {
  const capabilities: ChannelCapabilities = {
    supportsStreaming: false,
    supportsAttachments: false,
    supportsThreads: true,
    supportsReactions: false,
    supportsFormatting: 'plaintext',
    ...options,
  };

  return {
    type: 'test' as any,
    capabilities,

    normalize(raw: unknown): ChannelMessage {
      const input = raw as TestAdapterRaw;
      return {
        id: `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        channel: {
          type: 'test' as any,
          id: 'test-channel',
          capabilities,
        },
        user: {
          id: input.userId ?? 'test-user',
          isAdmin: input.isAdmin ?? false,
          isAuthenticated: input.isAuthenticated ?? true,
        },
        content: { text: input.message },
        timestamp: Date.now(),
        ...(input.sessionId ? { thread: { id: input.sessionId } } : {}),
      };
    },

    format(response: ChannelResponse): unknown {
      return {
        text: response.content.text,
        subagentName: response.subagentName,
        usage: response.usage,
        cost: response.cost,
      };
    },
  };
}
