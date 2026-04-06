import { describe, it, expect } from 'vitest';
import { createSmsAdapter, validateTwilioSignature } from '../adapters/sms';
import type { ChannelResponse } from '../types';
import type { AmygdalaResult } from '../../amygdala/types';
import { createHmac } from 'node:crypto';

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

describe('SmsAdapter', () => {
  const adapter = createSmsAdapter({ channelId: 'sms-twilio' });

  describe('capabilities', () => {
    it('has type sms', () => {
      expect(adapter.type).toBe('sms');
    });

    it('has maxResponseLength of 1600', () => {
      expect(adapter.capabilities.maxResponseLength).toBe(1600);
    });

    it('does not support streaming', () => {
      expect(adapter.capabilities.supportsStreaming).toBe(false);
    });

    it('supports attachments (MMS)', () => {
      expect(adapter.capabilities.supportsAttachments).toBe(true);
    });

    it('supports threads', () => {
      expect(adapter.capabilities.supportsThreads).toBe(true);
    });

    it('does not support reactions', () => {
      expect(adapter.capabilities.supportsReactions).toBe(false);
    });

    it('uses plaintext formatting', () => {
      expect(adapter.capabilities.supportsFormatting).toBe('plaintext');
    });
  });

  describe('normalize', () => {
    it('converts Twilio webhook payload to ChannelMessage', () => {
      const raw = {
        MessageSid: 'SM1234567890',
        From: '+15551234567',
        To: '+15559876543',
        Body: 'Hello agent',
        AccountSid: 'AC123',
        NumMedia: '0',
      };

      const msg = adapter.normalize(raw);

      expect(msg.id).toBe('SM1234567890');
      expect(msg.channel.type).toBe('sms');
      expect(msg.channel.id).toBe('sms-twilio');
      expect(msg.user.id).toBe('+15551234567');
      expect(msg.user.isAdmin).toBe(false);
      expect(msg.user.isAuthenticated).toBe(false);
      expect(msg.content.text).toBe('Hello agent');
      expect(msg.thread?.id).toBe('+15551234567');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('handles empty body gracefully', () => {
      const raw = {
        MessageSid: 'SM999',
        From: '+15551234567',
        To: '+15559876543',
        Body: '',
        NumMedia: '0',
      };

      const msg = adapter.normalize(raw);
      expect(msg.content.text).toBe('');
    });

    it('handles media attachments', () => {
      const raw = {
        MessageSid: 'SM888',
        From: '+15551234567',
        To: '+15559876543',
        Body: 'Check this out',
        NumMedia: '2',
        MediaUrl0: 'https://api.twilio.com/media/img1.jpg',
        MediaContentType0: 'image/jpeg',
        MediaUrl1: 'https://api.twilio.com/media/doc.pdf',
        MediaContentType1: 'application/pdf',
      };

      const msg = adapter.normalize(raw);
      expect(msg.content.attachments).toHaveLength(2);
      expect(msg.content.attachments![0]).toEqual({
        type: 'image',
        url: 'https://api.twilio.com/media/img1.jpg',
        mimeType: 'image/jpeg',
      });
      expect(msg.content.attachments![1]).toEqual({
        type: 'file',
        url: 'https://api.twilio.com/media/doc.pdf',
        mimeType: 'application/pdf',
      });
    });

    it('handles missing fields defensively', () => {
      const msg = adapter.normalize({});
      expect(msg.id).toBeTruthy();
      expect(msg.channel.type).toBe('sms');
      expect(msg.user.id).toBe('unknown');
      expect(msg.content.text).toBe('');
      expect(msg.timestamp).toBeGreaterThan(0);
    });

    it('handles null input defensively', () => {
      const msg = adapter.normalize(null);
      expect(msg.channel.type).toBe('sms');
      expect(msg.content.text).toBe('');
    });
  });

  describe('format', () => {
    it('returns TwiML-ready object', () => {
      const response: ChannelResponse = {
        messageId: 'msg-001',
        content: { text: 'Hello from the agent!' },
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as { twiml: string };
      expect(formatted.twiml).toBe(
        '<Response><Message>Hello from the agent!</Message></Response>',
      );
    });

    it('truncates response to 1600 characters', () => {
      const longText = 'A'.repeat(2000);
      const response: ChannelResponse = {
        messageId: 'msg-002',
        content: { text: longText },
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as { twiml: string };
      const match = formatted.twiml.match(/<Message>(.*)<\/Message>/);
      expect(match).toBeTruthy();
      expect(match![1].length).toBe(1600);
    });

    it('returns empty TwiML for empty content', () => {
      const response: ChannelResponse = {
        messageId: 'msg-003',
        content: { text: '' },
        traceEvents: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: 0,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as { twiml: string };
      expect(formatted.twiml).toBe('<Response/>');
    });

    it('escapes XML special characters', () => {
      const response: ChannelResponse = {
        messageId: 'msg-004',
        content: { text: 'Use <b>bold</b> & "quotes" aren\'t safe' },
        traceEvents: [],
        usage: { inputTokens: 10, outputTokens: 10 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: stubGuardian,
      };

      const formatted = adapter.format(response) as { twiml: string };
      expect(formatted.twiml).toContain('&amp;');
      expect(formatted.twiml).toContain('&lt;');
      expect(formatted.twiml).toContain('&gt;');
      expect(formatted.twiml).toContain('&quot;');
      expect(formatted.twiml).toContain('&apos;');
    });
  });
});

describe('validateTwilioSignature', () => {
  const authToken = 'test-auth-token-12345';
  const url = 'https://example.com/sms/webhook';

  function computeExpectedSignature(
    token: string,
    sigUrl: string,
    params: Record<string, string>,
  ): string {
    const sortedKeys = Object.keys(params).sort();
    let data = sigUrl;
    for (const key of sortedKeys) {
      data += key + params[key];
    }
    return createHmac('sha1', token).update(data).digest('base64');
  }

  it('returns true for valid signature', () => {
    const params = { Body: 'Hello', From: '+15551234567' };
    const signature = computeExpectedSignature(authToken, url, params);

    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const params = { Body: 'Hello', From: '+15551234567' };

    expect(validateTwilioSignature(authToken, 'bad-signature', url, params)).toBe(false);
  });

  it('returns false for tampered params', () => {
    const params = { Body: 'Hello', From: '+15551234567' };
    const signature = computeExpectedSignature(authToken, url, params);

    const tampered = { Body: 'Hacked', From: '+15551234567' };
    expect(validateTwilioSignature(authToken, signature, url, tampered)).toBe(false);
  });

  it('handles empty params', () => {
    const params = {};
    const signature = computeExpectedSignature(authToken, url, params);

    expect(validateTwilioSignature(authToken, signature, url, params)).toBe(true);
  });
});
