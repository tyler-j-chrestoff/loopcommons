import { describe, it, expect } from 'vitest';
import { createTestAdapter } from '../test';
import type { ChannelResponse } from '../../types';
import type { GuardianResult } from '../../../guardian/types';

const stubGuardian: GuardianResult = {
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

describe('TestAdapter', () => {
  it('has type "test"', () => {
    const adapter = createTestAdapter();
    expect(adapter.type).toBe('test');
  });

  it('normalizes raw input into ChannelMessage', () => {
    const adapter = createTestAdapter();
    const msg = adapter.normalize({
      message: 'hello from test',
      userId: 'test-user-1',
      sessionId: 'sess-1',
    });
    expect(msg.content.text).toBe('hello from test');
    expect(msg.user.id).toBe('test-user-1');
    expect(msg.channel.type).toBe('test');
    expect(msg.thread?.id).toBe('sess-1');
  });

  it('normalizes with defaults when optional fields missing', () => {
    const adapter = createTestAdapter();
    const msg = adapter.normalize({ message: 'hi' });
    expect(msg.content.text).toBe('hi');
    expect(msg.user.id).toBe('test-user');
    expect(msg.user.isAdmin).toBe(false);
    expect(msg.user.isAuthenticated).toBe(true);
  });

  it('formats response to simple text output', () => {
    const adapter = createTestAdapter();
    const response: ChannelResponse = {
      messageId: 'resp-1',
      content: { text: 'hello back' },
      traceEvents: [],
      usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0 },
      cost: 0.001,
      subagentId: 'conv',
      subagentName: 'conversation',
      guardianAssessment: stubGuardian,
    };
    const formatted = adapter.format(response) as { text: string; subagentName: string };
    expect(formatted.text).toBe('hello back');
    expect(formatted.subagentName).toBe('conversation');
  });

  it('has configurable capabilities', () => {
    const adapter = createTestAdapter({
      supportsStreaming: false,
      supportsAttachments: true,
    });
    expect(adapter.capabilities.supportsStreaming).toBe(false);
    expect(adapter.capabilities.supportsAttachments).toBe(true);
  });

  it('defaults to non-streaming plaintext capabilities', () => {
    const adapter = createTestAdapter();
    expect(adapter.capabilities.supportsStreaming).toBe(false);
    expect(adapter.capabilities.supportsFormatting).toBe('plaintext');
    expect(adapter.capabilities.supportsAttachments).toBe(false);
    expect(adapter.capabilities.supportsThreads).toBe(true);
    expect(adapter.capabilities.supportsReactions).toBe(false);
  });

  it('allows isAdmin override', () => {
    const adapter = createTestAdapter();
    const msg = adapter.normalize({ message: 'hi', isAdmin: true });
    expect(msg.user.isAdmin).toBe(true);
  });
});
