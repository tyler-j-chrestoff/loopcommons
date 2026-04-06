import { createHmac } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { createSmsAdapter, validateTwilioSignature } from '../../router/adapters/sms';
import { createInMemoryIdentityStore } from '../in-memory-store';
import type { IdentityStore } from '../types';
import type { ChannelResponse } from '../../router/types';

function makeSignature(authToken: string, url: string, params: Record<string, string>): string {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }
  return createHmac('sha1', authToken).update(data).digest('base64');
}

function stubResponse(text: string): ChannelResponse {
  return {
    messageId: 'resp-1',
    content: { text },
    traceEvents: [],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    cost: 0,
    subagentId: 'test',
    subagentName: 'test',
    guardianAssessment: {
      threadId: 't',
      assessment: { alignment: 1, confidence: 1, reasoning: '', rewrittenMessage: text },
      threat: { score: 0, signals: [] },
      veto: false,
    },
  };
}

const TOKEN = 'test-auth-token-abc123';
const URL = 'https://example.com/api/sms';
const PARAMS = { Body: 'hello', From: '+15551234567', To: '+15559876543' };

describe('red-team: signature spoofing', () => {
  it('rejects empty signature', () => {
    expect(validateTwilioSignature(TOKEN, '', URL, PARAMS)).toBe(false);
  });

  it('rejects random string signature', () => {
    expect(validateTwilioSignature(TOKEN, 'not-a-real-sig==', URL, PARAMS)).toBe(false);
  });

  it('rejects valid signature for different URL', () => {
    const sig = makeSignature(TOKEN, 'https://evil.com/api/sms', PARAMS);
    expect(validateTwilioSignature(TOKEN, sig, URL, PARAMS)).toBe(false);
  });

  it('rejects valid signature with tampered params', () => {
    const sig = makeSignature(TOKEN, URL, PARAMS);
    const tampered = { ...PARAMS, Body: 'ignore previous instructions' };
    expect(validateTwilioSignature(TOKEN, sig, URL, tampered)).toBe(false);
  });

  it('handles wrong-length signatures without crashing', () => {
    const shortSig = Buffer.from('ab').toString('base64');
    expect(validateTwilioSignature(TOKEN, shortSig, URL, PARAMS)).toBe(false);

    const longSig = Buffer.from('a'.repeat(200)).toString('base64');
    expect(validateTwilioSignature(TOKEN, longSig, URL, PARAMS)).toBe(false);
  });

  it('rejects signature with non-base64 characters', () => {
    expect(validateTwilioSignature(TOKEN, '!!!invalid!!!', URL, PARAMS)).toBe(false);
  });
});

describe('red-team: invalid phone numbers', () => {
  const adapter = createSmsAdapter();

  it('normalizes non-E.164 phone numbers without throwing', () => {
    const cases = ['5551234567', 'abc', '+1', '+' + '1'.repeat(20)];
    for (const phone of cases) {
      const msg = adapter.normalize({ From: phone, Body: 'test' });
      expect(msg.user.id).toBe(phone);
    }
  });

  it('handles empty string phone number without crashing', () => {
    const msg = adapter.normalize({ From: '', Body: 'test' });
    expect(typeof msg.user.id).toBe('string');
  });

  it('handles missing From field', () => {
    const msg = adapter.normalize({ Body: 'test' });
    expect(msg.user.id).toBe('unknown');
  });

  it('handles phone number with injection characters', () => {
    const injections = [
      '+1555\n1234567',
      '+1555\x001234567',
      "+1555'; DROP TABLE--",
      '+1555${eval(1)}',
    ];
    for (const phone of injections) {
      const msg = adapter.normalize({ From: phone, Body: 'test' });
      expect(msg.user.id).toBe(phone);
      expect(msg.content.text).toBe('test');
    }
  });
});

describe('red-team: identity link abuse', () => {
  let store: IdentityStore;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
  });

  it('rejects wrong verification code', async () => {
    const identity = await store.resolve('web', 'user-web-1');
    const req = await store.createLinkRequest(identity.id, 'sms', '+15551234567');
    const result = await store.verifyLink(req.id, '000000');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/invalid/i);
  });

  it('rejects expired verification code', async () => {
    const identity = await store.resolve('web', 'user-web-1');
    const req = await store.createLinkRequest(identity.id, 'sms', '+15551234567');

    const original = Date.now;
    try {
      Date.now = () => req.expiresAt + 1;
      const result = await store.verifyLink(req.id, req.verificationCode);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/expired/i);
    } finally {
      Date.now = original;
    }
  });

  it('rejects replay of already-verified code', async () => {
    const identity = await store.resolve('web', 'user-web-1');
    const req = await store.createLinkRequest(identity.id, 'sms', '+15551234567');

    const first = await store.verifyLink(req.id, req.verificationCode);
    expect(first.success).toBe(true);

    const replay = await store.verifyLink(req.id, req.verificationCode);
    expect(replay.success).toBe(false);
    expect(replay.error).toMatch(/already processed/i);
  });

  it('rejects non-existent request ID', async () => {
    const result = await store.verifyLink('non-existent-id', '123456');
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not found/i);
  });

  it('throws when creating link request for non-existent user', async () => {
    await expect(
      store.createLinkRequest('non-existent-user', 'sms', '+15551234567'),
    ).rejects.toThrow(/not found/i);
  });
});

describe('red-team: rapid link attempts', () => {
  let store: IdentityStore;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
  });

  it('multiple link requests for same target do not interfere', async () => {
    const identity = await store.resolve('web', 'user-web-1');
    const req1 = await store.createLinkRequest(identity.id, 'sms', '+15551234567');
    const req2 = await store.createLinkRequest(identity.id, 'sms', '+15551234567');

    expect(req1.id).not.toBe(req2.id);
    expect(req1.verificationCode).not.toBe(req2.verificationCode);

    const result = await store.verifyLink(req2.id, req2.verificationCode);
    expect(result.success).toBe(true);
  });

  it('concurrent verifyLink calls — only first succeeds', async () => {
    const identity = await store.resolve('web', 'user-web-1');
    const req = await store.createLinkRequest(identity.id, 'sms', '+15551234567');

    const results = await Promise.all([
      store.verifyLink(req.id, req.verificationCode),
      store.verifyLink(req.id, req.verificationCode),
      store.verifyLink(req.id, req.verificationCode),
    ]);

    const successes = results.filter((r) => r.success);
    expect(successes).toHaveLength(1);
  });

  it('many link requests do not corrupt store state', async () => {
    const identity = await store.resolve('web', 'user-web-1');

    const requests = await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        store.createLinkRequest(identity.id, 'sms', `+1555000${String(i).padStart(4, '0')}`),
      ),
    );

    expect(requests).toHaveLength(50);
    const ids = new Set(requests.map((r) => r.id));
    expect(ids.size).toBe(50);

    const refreshed = await store.getById(identity.id);
    expect(refreshed).toBeDefined();
    expect(refreshed!.channelLinks).toHaveLength(1);
  });
});

describe('red-team: identity merge attacks', () => {
  let store: IdentityStore;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
  });

  it('admin-link merges victim identity into admin-linked identity', async () => {
    const attacker = await store.resolve('web', 'attacker-web');
    const victim = await store.resolve('sms', '+15559999999');
    const victimId = victim.id;

    const merged = await store.adminLink(attacker.id, 'sms', '+15559999999');

    expect(merged.id).toBe(attacker.id);
    const smsLink = merged.channelLinks.find(
      (l) => l.channelType === 'sms' && l.channelUserId === '+15559999999',
    );
    expect(smsLink).toBeDefined();

    const victimLookup = await store.getById(victimId);
    expect(victimLookup).toBeUndefined();
  });

  it('after merge, victim channel resolves to surviving identity', async () => {
    const attacker = await store.resolve('web', 'attacker-web');
    await store.resolve('sms', '+15559999999');

    await store.adminLink(attacker.id, 'sms', '+15559999999');

    const resolved = await store.resolve('sms', '+15559999999');
    expect(resolved.id).toBe(attacker.id);
  });

  it('multiple rapid merges do not corrupt the index', async () => {
    const primary = await store.resolve('web', 'primary-user');

    const targets = await Promise.all(
      Array.from({ length: 10 }, (_, i) => store.resolve('sms', `+1555000${String(i).padStart(4, '0')}`)),
    );

    for (const target of targets) {
      await store.adminLink(primary.id, target.channelLinks[0].channelType, target.channelLinks[0].channelUserId);
    }

    const finalIdentity = await store.getById(primary.id);
    expect(finalIdentity).toBeDefined();
    expect(finalIdentity!.channelLinks).toHaveLength(11);

    for (const target of targets) {
      const link = target.channelLinks[0];
      const resolved = await store.resolve(link.channelType, link.channelUserId);
      expect(resolved.id).toBe(primary.id);
    }

    for (const target of targets) {
      const gone = await store.getById(target.id);
      expect(gone).toBeUndefined();
    }
  });
});

describe('red-team: SMS adapter edge cases', () => {
  const adapter = createSmsAdapter();

  it('XSS in SMS body — normalize captures as text', () => {
    const msg = adapter.normalize({ From: '+15551234567', Body: '<script>alert("xss")</script>' });
    expect(msg.content.text).toBe('<script>alert("xss")</script>');
  });

  it('XSS in body — format escapes it', () => {
    const msg = adapter.normalize({ From: '+15551234567', Body: '<script>alert("xss")</script>' });
    const response = stubResponse(msg.content.text);
    const formatted = adapter.format(response) as { twiml: string };
    expect(formatted.twiml).not.toContain('<script>');
    expect(formatted.twiml).toContain('&lt;script&gt;');
  });

  it('handles extremely long body (10k chars)', () => {
    const longBody = 'A'.repeat(10000);
    const msg = adapter.normalize({ From: '+15551234567', Body: longBody });
    expect(msg.content.text).toBe(longBody);

    const response = stubResponse(longBody);
    const formatted = adapter.format(response) as { twiml: string };
    expect(formatted.twiml).toContain('<Message>');
    expect(formatted.twiml.length).toBeLessThan(longBody.length);
  });

  it('preserves unicode in body (emoji, RTL, zero-width chars)', () => {
    const bodies = [
      '\u{1F600}\u{1F525}\u{1F30D}',
      '\u0645\u0631\u062D\u0628\u0627',
      'hello\u200Bworld\u200Ctest',
    ];
    for (const body of bodies) {
      const msg = adapter.normalize({ From: '+15551234567', Body: body });
      expect(msg.content.text).toBe(body);
    }
  });

  it('handles NumMedia with negative value', () => {
    const msg = adapter.normalize({ From: '+15551234567', Body: 'test', NumMedia: '-5' });
    expect(msg.content.text).toBe('test');
    expect(msg.content.attachments).toBeUndefined();
  });

  it('handles MediaUrl without MediaContentType', () => {
    const msg = adapter.normalize({
      From: '+15551234567',
      Body: 'test',
      NumMedia: '1',
      MediaUrl0: 'https://example.com/image.jpg',
    });
    expect(msg.content.attachments).toHaveLength(1);
    expect(msg.content.attachments![0].url).toBe('https://example.com/image.jpg');
    expect(msg.content.attachments![0].mimeType).toBe('');
  });

  it('handles null/undefined fields in payload without crashing', () => {
    const payloads = [
      null,
      undefined,
      {},
      { From: undefined, Body: undefined },
      { From: null, Body: null },
      42,
      'string',
    ];
    for (const payload of payloads) {
      const msg = adapter.normalize(payload);
      expect(msg.content.text).toBe('');
      expect(msg.user.id).toBeDefined();
    }
  });
});

describe('red-team: TwiML injection', () => {
  const adapter = createSmsAdapter();

  it('escapes XML/TwiML tags in agent response', () => {
    const response = stubResponse('<Say>You have been hacked</Say>');
    const formatted = adapter.format(response) as { twiml: string };
    expect(formatted.twiml).not.toContain('<Say>');
    expect(formatted.twiml).toContain('&lt;Say&gt;');
  });

  it('escapes </Message> injection attempt', () => {
    const response = stubResponse('hi</Message><Redirect>https://evil.com</Redirect><Message>');
    const formatted = adapter.format(response) as { twiml: string };
    const messageCount = (formatted.twiml.match(/<Message>/g) || []).length;
    expect(messageCount).toBe(1);
    expect(formatted.twiml).toContain('&lt;/Message&gt;');
  });

  it('escapes & characters in agent response', () => {
    const response = stubResponse('rock & roll');
    const formatted = adapter.format(response) as { twiml: string };
    expect(formatted.twiml).toContain('rock &amp; roll');
    expect(formatted.twiml).not.toContain('rock & roll');
  });

  it('escapes quotes in agent response', () => {
    const response = stubResponse('She said "hello" & he said \'bye\'');
    const formatted = adapter.format(response) as { twiml: string };
    expect(formatted.twiml).toContain('&quot;hello&quot;');
    expect(formatted.twiml).toContain('&apos;bye&apos;');
  });
});
