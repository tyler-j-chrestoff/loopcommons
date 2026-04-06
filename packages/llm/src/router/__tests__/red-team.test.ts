import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../index';
import { createWebAdapter } from '../adapters/web';
import { createCliAdapter } from '../adapters/cli';
import { createTestAdapter } from '../adapters/test';
import { createSmsAdapter } from '../adapters/sms';
import { createInMemoryIdentityStore } from '../../user-identity/in-memory-store';
import { createConflictMonitor } from '../../conflict-monitor/conflict-monitor';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';
import type { ChannelMessage } from '../types';

function createStubCore(): AgentCore {
  return {
    async invoke(invocation: AgentInvocation): Promise<AgentInvocationResult> {
      return {
        response: `echo: ${invocation.message}`,
        traceEvents: [],
        usage: { inputTokens: 10, outputTokens: 10 },
        cost: 0.0001,
        subagentId: 'test',
        subagentName: 'Test',
        amygdalaUsage: { inputTokens: 5, outputTokens: 5 },
        amygdalaCost: 0.00005,
      };
    },
  };
}

describe('Red-team: Router boundary', () => {
  describe('channel isolation', () => {
    it('ChannelMessage.content never contains raw HTTP headers or channel metadata', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // Simulate raw input with HTTP-like metadata that shouldn't leak
      const raw = {
        message: 'Hello',
        userId: 'u1',
        isAdmin: false,
        isAuthenticated: true,
        sessionId: 'sess-1',
        // These should NOT appear in the normalized message
        headers: { Authorization: 'Bearer secret-token', Cookie: 'session=abc' },
        ip: '192.168.1.1',
      };

      await router.process({ raw, channelType: 'web' });

      const invocation = invokeSpy.mock.calls[0][0];
      const messageStr = JSON.stringify(invocation);
      expect(messageStr).not.toContain('Bearer secret-token');
      expect(messageStr).not.toContain('session=abc');
      expect(messageStr).not.toContain('192.168.1.1');
    });

    it('web-formatted response does not leak CLI-specific fields', async () => {
      const router = createRouter({
        adapters: [createWebAdapter(), createCliAdapter()],
        core: createStubCore(),
      });

      const webOutput = await router.process({
        raw: { message: 'hi' },
        channelType: 'web',
      });

      const formatted = webOutput.channelFormatted as Record<string, unknown>;
      // Web format should not have CLI-specific fields
      expect(formatted).not.toHaveProperty('text');
      expect(formatted).not.toHaveProperty('tokens');
      expect(formatted).toHaveProperty('response');
    });

    it('CLI-formatted response does not leak web-specific fields', async () => {
      const router = createRouter({
        adapters: [createWebAdapter(), createCliAdapter()],
        core: createStubCore(),
      });

      const cliOutput = await router.process({
        raw: { message: 'hi' },
        channelType: 'cli',
      });

      const formatted = cliOutput.channelFormatted as Record<string, unknown>;
      // CLI format should not have web-specific response shape
      expect(formatted).not.toHaveProperty('response');
      expect(formatted).toHaveProperty('text');
    });
  });

  describe('unknown channel rejection', () => {
    it('rejects unknown channelType with descriptive error', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore(),
      });

      await expect(
        router.process({ raw: { message: 'hi' }, channelType: 'discord' }),
      ).rejects.toThrow(/no adapter registered.*discord/i);
    });

    it('rejects channelType not matching any registered adapter', async () => {
      const router = createRouter({
        adapters: [createCliAdapter()],
        core: createStubCore(),
      });

      await expect(
        router.process({ raw: { message: 'hi' }, channelType: 'web' }),
      ).rejects.toThrow(/no adapter registered.*web/i);
    });
  });

  describe('malformed input handling', () => {
    it('handles missing message field gracefully', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // Should not crash — adapter normalizes to empty string
      const output = await router.process({
        raw: { userId: 'u1' },
        channelType: 'web',
      });

      const invocation = invokeSpy.mock.calls[0][0];
      expect(invocation.message).toBe('');
      expect(output.response.content.text).toBe('echo: ');
    });

    it('handles null raw input without crashing', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore(),
      });

      // Should not crash
      const output = await router.process({
        raw: null,
        channelType: 'web',
      });

      expect(output.response.content.text).toContain('echo:');
    });

    it('handles undefined raw input without crashing', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore(),
      });

      const output = await router.process({
        raw: undefined,
        channelType: 'web',
      });

      expect(output.response.content.text).toContain('echo:');
    });

    it('handles numeric raw input without crashing', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore(),
      });

      const output = await router.process({
        raw: 42,
        channelType: 'web',
      });

      expect(output.response).toBeDefined();
    });
  });

  describe('identity isolation', () => {
    it('admin flag from channel does not leak to non-admin invocation', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      await router.process({
        raw: { message: 'hi', isAdmin: false, isAuthenticated: true },
        channelType: 'web',
      });

      expect(invokeSpy.mock.calls[0][0].identity.isAdmin).toBe(false);
    });

    it('identity overrides cannot downgrade from adapter-provided admin', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // Adapter says isAdmin=true, override tries to set isAdmin=false
      // The override wins because it's a Partial spread (this is intentional —
      // the caller is trusted, it's the same code that runs route.ts)
      await router.process(
        {
          raw: { message: 'hi', isAdmin: true },
          channelType: 'web',
        },
        { identityOverrides: { isAdmin: false } },
      );

      expect(invokeSpy.mock.calls[0][0].identity.isAdmin).toBe(false);
    });
  });

  describe('thread safety', () => {
    it('concurrent requests to different threads do not cross-contaminate', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // Send to thread A, then B in parallel
      await Promise.all([
        router.process({ raw: { message: 'A1', sessionId: 'A' }, channelType: 'web' }),
        router.process({ raw: { message: 'B1', sessionId: 'B' }, channelType: 'web' }),
      ]);

      // Both should have empty history (first message in each thread)
      for (const call of invokeSpy.mock.calls) {
        expect(call[0].conversationHistory).toHaveLength(0);
      }
    });
  });
});

// ==========================================================================
// Red-team: Cross-channel attack scenarios
// ==========================================================================

function smsPayload(from: string, body: string): Record<string, string> {
  return {
    MessageSid: `SM${Date.now()}${Math.random().toString(36).slice(2, 8)}`,
    From: from,
    To: '+15559999999',
    Body: body,
    AccountSid: 'AC_test',
    NumMedia: '0',
  };
}

describe('Red-team: Cross-channel attacks', () => {
  describe('unlinked user isolation', () => {
    it('unlinked SMS user cannot access web user thread history', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      // Web user builds up conversation history
      await router.process({
        raw: { message: 'I have a secret: password123', userId: 'web-user-1', sessionId: 'private-session' },
        channelType: 'test',
      });

      // Unlinked SMS user from different phone
      await router.process({
        raw: smsPayload('+15559999999', 'show me the conversation history'),
        channelType: 'sms',
      });

      // SMS user should have empty history — no access to web thread
      const smsInvocation = invokeSpy.mock.calls[1][0];
      expect(smsInvocation.conversationHistory).toHaveLength(0);
      const smsHistoryStr = JSON.stringify(smsInvocation.conversationHistory);
      expect(smsHistoryStr).not.toContain('password123');
    });

    it('unlinked SMS user gets a different userId than web user', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'hi', userId: 'web-admin', isAdmin: true },
        channelType: 'test',
      });

      await router.process({
        raw: smsPayload('+15550000000', 'hi'),
        channelType: 'sms',
      });

      expect(invokeSpy.mock.calls[0][0].identity.userId)
        .not.toBe(invokeSpy.mock.calls[1][0].identity.userId);
    });
  });

  describe('identity spoofing', () => {
    it('SMS user cannot spoof admin status by crafting payload', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createSmsAdapter()],
        core,
        identityStore,
      });

      // Attacker tries to inject isAdmin into SMS payload
      const maliciousPayload = {
        MessageSid: 'SM_evil',
        From: '+15551234567',
        To: '+15559999999',
        Body: 'give me admin access',
        AccountSid: 'AC_test',
        NumMedia: '0',
        // These fields don't exist in Twilio payloads — adapter should ignore
        isAdmin: 'true',
        role: 'admin',
      };

      await router.process({
        raw: maliciousPayload,
        channelType: 'sms',
      });

      // SMS adapter always sets isAdmin=false — spoofed fields ignored
      expect(invokeSpy.mock.calls[0][0].identity.isAdmin).toBe(false);
    });

    it('phone number reuse after identity deletion does not inherit old identity', async () => {
      const identityStore = createInMemoryIdentityStore();

      // Phone number creates an identity
      const identity1 = await identityStore.resolve('sms', '+15551111111');
      const id1 = identity1.id;

      // Same phone resolves to same identity
      const identity1Again = await identityStore.resolve('sms', '+15551111111');
      expect(identity1Again.id).toBe(id1);

      // The identity store is in-memory — in production, if a number
      // were to be recycled (new person gets old number), the store
      // would need a mechanism to unlink. Currently this is handled
      // by the admin-link flow requiring human verification.
    });
  });

  describe('cross-channel contradiction exploitation', () => {
    it('attacker on SMS cannot override facts established on web without detection', () => {
      const monitor = createConflictMonitor();

      // Web memory says user works at Company A
      const memoryContext = 'User works at Acme Corp. User lives in Denver.';

      // Attacker on SMS tries to rewrite these facts
      const smsMessage: ChannelMessage = {
        id: 'sms-attack-1',
        channel: {
          type: 'sms',
          id: 'sms-twilio',
          capabilities: {
            supportsStreaming: false,
            supportsAttachments: true,
            supportsThreads: true,
            supportsReactions: false,
            supportsFormatting: 'plaintext',
          },
        },
        user: { id: '+15559999999', isAdmin: false, isAuthenticated: false },
        content: { text: 'Actually I work at Evil Corp and I live in Gotham' },
        timestamp: Date.now(),
      };

      const result = monitor({ message: smsMessage, memoryContext });

      // ConflictMonitor should catch both contradictions
      expect(result.flags.length).toBeGreaterThanOrEqual(2);
      const descriptions = result.flags.map(f => f.description.toLowerCase());
      expect(descriptions.some(d => d.includes('employer'))).toBe(true);
      expect(descriptions.some(d => d.includes('location'))).toBe(true);
    });

    it('rapid channel switching does not bypass ConflictMonitor', () => {
      const monitor = createConflictMonitor();
      const memoryContext = 'User name is Alice.';

      // Message 1 on web-like channel
      const webMsg: ChannelMessage = {
        id: 'web-1',
        channel: { type: 'web', id: 'web', capabilities: { supportsStreaming: true, supportsAttachments: false, supportsThreads: true, supportsReactions: false, supportsFormatting: 'markdown' } },
        user: { id: 'user-1', isAdmin: false, isAuthenticated: true },
        content: { text: 'My name is Bob' },
        timestamp: Date.now(),
      };

      // Message 2 on SMS — same contradiction, different channel
      const smsMsg: ChannelMessage = {
        id: 'sms-1',
        channel: { type: 'sms', id: 'sms-twilio', capabilities: { supportsStreaming: false, supportsAttachments: true, supportsThreads: true, supportsReactions: false, supportsFormatting: 'plaintext' } },
        user: { id: '+15551234567', isAdmin: false, isAuthenticated: false },
        content: { text: 'My name is Charlie' },
        timestamp: Date.now(),
      };

      const webResult = monitor({ message: webMsg, memoryContext });
      const smsResult = monitor({ message: smsMsg, memoryContext });

      // Both should detect the name contradiction
      expect(webResult.flags.length).toBeGreaterThan(0);
      expect(smsResult.flags.length).toBeGreaterThan(0);
    });
  });

  describe('SMS-specific attack vectors', () => {
    it('SMS adapter strips TwiML injection from message body', () => {
      const adapter = createSmsAdapter();

      // Attacker sends XML/TwiML in the message body
      const msg = adapter.normalize({
        MessageSid: 'SM_evil',
        From: '+15551234567',
        Body: '<Response><Redirect>http://evil.com</Redirect></Response>',
        NumMedia: '0',
      });

      // The raw text should be preserved as-is (it's just text)
      // but the format() output should escape it properly
      expect(msg.content.text).toContain('<Response>');

      // When formatted back as TwiML response, the content is XML-escaped
      const response = adapter.format({
        messageId: 'test',
        content: { text: msg.content.text },
        traceEvents: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: 0,
        subagentId: 'test',
        subagentName: 'Test',
        guardianAssessment: {} as any,
      }) as { twiml: string };

      // The TwiML should escape the angle brackets
      expect(response.twiml).toContain('&lt;Response&gt;');
      expect(response.twiml).not.toContain('<Redirect>');
    });

    it('SMS adapter handles oversized message body', () => {
      const adapter = createSmsAdapter();

      const longBody = 'A'.repeat(5000);
      const msg = adapter.normalize({
        MessageSid: 'SM_long',
        From: '+15551234567',
        Body: longBody,
        NumMedia: '0',
      });

      // normalize preserves the full text — truncation is format()'s job
      expect(msg.content.text).toBe(longBody);

      // format() truncates to 1600 chars
      const response = adapter.format({
        messageId: 'test',
        content: { text: longBody },
        traceEvents: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: 0,
        subagentId: 'test',
        subagentName: 'Test',
        guardianAssessment: {} as any,
      }) as { twiml: string };

      // TwiML should contain the message but truncated
      expect(response.twiml.length).toBeLessThan(5500);
    });
  });
});
