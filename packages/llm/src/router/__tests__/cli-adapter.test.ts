import { describe, it, expect } from 'vitest';
import { createCliAdapter } from '../adapters/cli';
import type { ChannelResponse } from '../types';
import type { AmygdalaResult } from '../../amygdala/types';

const stubGuardian: AmygdalaResult = {
  rewrittenPrompt: '',
  intent: 'conversation',
  threat: { score: 0, category: 'none', reasoning: '' },
  veto: false,
  contextDelegation: { historyIndices: [], annotations: [] },
  traceEvents: [],
  latencyMs: 0,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
  cost: 0,
};

describe('CliAdapter', () => {
  const adapter = createCliAdapter();

  it('has correct type and capabilities', () => {
    expect(adapter.type).toBe('cli');
    expect(adapter.capabilities.supportsStreaming).toBe(true);
    expect(adapter.capabilities.supportsAttachments).toBe(false);
    expect(adapter.capabilities.supportsThreads).toBe(true);
    expect(adapter.capabilities.supportsFormatting).toBe('markdown');
  });

  describe('normalize', () => {
    it('converts CLI input to ChannelMessage', () => {
      const raw = {
        message: 'What is Loop Commons?',
        isAdmin: true,
        sessionId: 'cli-sess-001',
      };

      const msg = adapter.normalize(raw);

      expect(msg.channel.type).toBe('cli');
      expect(msg.channel.id).toBe('cli-local');
      expect(msg.user.id).toBe('cli-user');
      expect(msg.user.isAdmin).toBe(true);
      expect(msg.user.isAuthenticated).toBe(true);
      expect(msg.content.text).toBe('What is Loop Commons?');
      expect(msg.thread?.id).toBe('cli-sess-001');
    });

    it('defaults to non-admin when not specified', () => {
      const raw = { message: 'hello' };
      const msg = adapter.normalize(raw);
      expect(msg.user.isAdmin).toBe(false);
      expect(msg.user.isAuthenticated).toBe(true);
    });

    it('generates unique message IDs', () => {
      const msg1 = adapter.normalize({ message: 'a' });
      const msg2 = adapter.normalize({ message: 'b' });
      expect(msg1.id).not.toBe(msg2.id);
    });
  });

  describe('format', () => {
    it('returns text and cost summary', () => {
      const response: ChannelResponse = {
        messageId: 'msg-001',
        content: { text: 'Loop Commons is a research platform.' },
        traceEvents: [],
        usage: { inputTokens: 200, outputTokens: 100 },
        cost: 0.002,
        subagentId: 'project',
        subagentName: 'Project',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as {
        text: string;
        subagentName: string;
        tokens: number;
        cost: number;
      };

      expect(formatted.text).toBe('Loop Commons is a research platform.');
      expect(formatted.subagentName).toBe('Project');
      expect(formatted.tokens).toBe(300);
      expect(formatted.cost).toBe(0.002);
    });
  });
});
