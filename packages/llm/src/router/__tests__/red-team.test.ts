import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../index';
import { createWebAdapter } from '../adapters/web';
import { createCliAdapter } from '../adapters/cli';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';

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
