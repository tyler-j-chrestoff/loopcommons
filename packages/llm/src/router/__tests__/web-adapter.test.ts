import { describe, it, expect } from 'vitest';
import { createWebAdapter } from '../adapters/web';
import type { ChannelResponse } from '../types';
import type { AmygdalaResult } from '../../amygdala/types';

const stubGuardian: AmygdalaResult = {
  rewrittenPrompt: '',
  intent: 'conversation',
  threat: { score: 0, category: 'none', reasoning: '' },
  contextDelegation: { historyIndices: [], annotations: [] },
  traceEvents: [],
  latencyMs: 0,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  cost: 0,
};

describe('WebAdapter', () => {
  const adapter = createWebAdapter({ channelId: 'web-main' });

  it('has correct type and capabilities', () => {
    expect(adapter.type).toBe('web');
    expect(adapter.capabilities.supportsStreaming).toBe(true);
    expect(adapter.capabilities.supportsAttachments).toBe(false);
    expect(adapter.capabilities.supportsThreads).toBe(true);
    expect(adapter.capabilities.supportsFormatting).toBe('markdown');
  });

  describe('normalize', () => {
    it('converts web request shape to ChannelMessage', () => {
      const raw = {
        message: 'Hello agent',
        userId: 'user-abc',
        isAdmin: false,
        isAuthenticated: true,
        sessionId: 'sess-001',
      };

      const msg = adapter.normalize(raw);

      expect(msg.channel.type).toBe('web');
      expect(msg.channel.id).toBe('web-main');
      expect(msg.user.id).toBe('user-abc');
      expect(msg.user.isAdmin).toBe(false);
      expect(msg.user.isAuthenticated).toBe(true);
      expect(msg.content.text).toBe('Hello agent');
      expect(msg.thread?.id).toBe('sess-001');
      expect(msg.id).toBeTruthy();
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('handles admin user', () => {
      const raw = {
        message: 'admin command',
        userId: 'admin',
        isAdmin: true,
        isAuthenticated: true,
      };

      const msg = adapter.normalize(raw);
      expect(msg.user.isAdmin).toBe(true);
    });

    it('defaults userId to anonymous when missing', () => {
      const raw = { message: 'hello' };
      const msg = adapter.normalize(raw);
      expect(msg.user.id).toBe('anonymous');
      expect(msg.user.isAdmin).toBe(false);
      expect(msg.user.isAuthenticated).toBe(false);
    });

    it('generates unique message IDs', () => {
      const raw = { message: 'test' };
      const msg1 = adapter.normalize(raw);
      const msg2 = adapter.normalize(raw);
      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('format', () => {
    it('returns response text and metadata', () => {
      const response: ChannelResponse = {
        messageId: 'msg-001',
        content: { text: 'Hello! How can I help?' },
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as {
        response: string;
        usage: { inputTokens: number; outputTokens: number };
        cost: number;
        subagentId: string;
        subagentName: string;
      };

      expect(formatted.response).toBe('Hello! How can I help?');
      expect(formatted.usage.inputTokens).toBe(100);
      expect(formatted.cost).toBe(0.001);
      expect(formatted.subagentId).toBe('conversational');
    });
  });
});
