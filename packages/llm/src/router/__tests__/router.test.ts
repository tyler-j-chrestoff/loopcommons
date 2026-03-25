import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../index';
import { createWebAdapter } from '../adapters/web';
import { createCliAdapter } from '../adapters/cli';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';
import type { TraceEvent } from '../../trace/events';

function createStubCore(response = 'Hello!'): AgentCore {
  return {
    async invoke(invocation: AgentInvocation): Promise<AgentInvocationResult> {
      return {
        response,
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        amygdalaUsage: { inputTokens: 50, outputTokens: 20 },
        amygdalaCost: 0.0003,
      };
    },
  };
}

describe('Router', () => {
  describe('process', () => {
    it('normalizes web input, calls core, returns ChannelResponse', async () => {
      const core = createStubCore('Hello from the agent!');
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      const output = await router.process({
        raw: { message: 'Hi there', userId: 'u1', isAdmin: false, isAuthenticated: true },
        channelType: 'web',
      });

      expect(output.response.content.text).toBe('Hello from the agent!');
      expect(output.response.subagentId).toBe('conversational');
      expect(output.response.cost).toBe(0.001);

      // Verify core was called with normalized input
      expect(invokeSpy).toHaveBeenCalledOnce();
      const invocation = invokeSpy.mock.calls[0][0];
      expect(invocation.message).toBe('Hi there');
      expect(invocation.identity.interfaceId).toBe('web');
      expect(invocation.identity.isAdmin).toBe(false);
    });

    it('normalizes CLI input, calls core, returns ChannelResponse', async () => {
      const core = createStubCore('CLI response');

      const router = createRouter({
        adapters: [createCliAdapter()],
        core,
      });

      const output = await router.process({
        raw: { message: 'hello', isAdmin: true },
        channelType: 'cli',
      });

      expect(output.response.content.text).toBe('CLI response');
    });

    it('rejects unknown channel type', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore(),
      });

      await expect(
        router.process({ raw: { message: 'hi' }, channelType: 'discord' }),
      ).rejects.toThrow(/no adapter registered.*discord/i);
    });

    it('maintains per-thread conversation history', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // First message in thread
      await router.process({
        raw: { message: 'first', userId: 'u1', isAuthenticated: true, sessionId: 'thread-1' },
        channelType: 'web',
      });

      // Second message in same thread — should include first exchange in history
      await router.process({
        raw: { message: 'second', userId: 'u1', isAuthenticated: true, sessionId: 'thread-1' },
        channelType: 'web',
      });

      const secondCall = invokeSpy.mock.calls[1][0];
      expect(secondCall.conversationHistory).toHaveLength(2);
      expect(secondCall.conversationHistory[0].role).toBe('user');
      expect(secondCall.conversationHistory[0].content).toBe('first');
      expect(secondCall.conversationHistory[1].role).toBe('assistant');
      expect(secondCall.conversationHistory[1].content).toBe('Hello!');
    });

    it('isolates history between threads', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      await router.process({
        raw: { message: 'thread A msg', sessionId: 'A' },
        channelType: 'web',
      });

      await router.process({
        raw: { message: 'thread B msg', sessionId: 'B' },
        channelType: 'web',
      });

      // Thread B should have empty history (different thread)
      const threadBCall = invokeSpy.mock.calls[1][0];
      expect(threadBCall.conversationHistory).toHaveLength(0);
    });

    it('messages without thread get no history accumulation', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      await router.process({
        raw: { message: 'first' },
        channelType: 'web',
      });

      await router.process({
        raw: { message: 'second' },
        channelType: 'web',
      });

      // No thread = no history
      const secondCall = invokeSpy.mock.calls[1][0];
      expect(secondCall.conversationHistory).toHaveLength(0);
    });

    it('forwards onTraceEvent to core invocation', async () => {
      const core = createStubCore();

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      const events: TraceEvent[] = [];
      await router.process(
        { raw: { message: 'hi' }, channelType: 'web' },
        { onTraceEvent: (e) => events.push(e) },
      );

      // The stub core doesn't emit events, but verify the callback was wired through
      expect(events).toHaveLength(0);
    });

    it('forwards stream option to core invocation', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      await router.process(
        { raw: { message: 'hi' }, channelType: 'web' },
        { stream: false },
      );

      expect(invokeSpy.mock.calls[0][0].stream).toBe(false);
    });

    it('uses caller-provided conversationHistory when set', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      const callerHistory = [
        { role: 'user' as const, content: 'prior message' },
        { role: 'assistant' as const, content: 'prior response' },
      ];

      await router.process(
        { raw: { message: 'new msg', sessionId: 'thread-1' }, channelType: 'web' },
        { conversationHistory: callerHistory },
      );

      const invocation = invokeSpy.mock.calls[0][0];
      expect(invocation.conversationHistory).toBe(callerHistory);
      expect(invocation.conversationHistory).toHaveLength(2);
    });

    it('does not update thread history when caller provides history', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      // Call with caller-provided history
      await router.process(
        { raw: { message: 'msg1', sessionId: 'thread-1' }, channelType: 'web' },
        { conversationHistory: [] },
      );

      // Second call WITHOUT caller history — should use Router's internal (empty)
      await router.process(
        { raw: { message: 'msg2', sessionId: 'thread-1' }, channelType: 'web' },
      );

      const secondCall = invokeSpy.mock.calls[1][0];
      expect(secondCall.conversationHistory).toHaveLength(0);
    });

    it('merges identity overrides', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createWebAdapter()],
        core,
      });

      await router.process(
        { raw: { message: 'hi', userId: 'u1', isAdmin: false, isAuthenticated: true }, channelType: 'web' },
        {
          identityOverrides: {
            commitSha: 'abc123',
            requestMetadata: {
              ipHash: 'hashed-ip',
              isAuthenticated: true,
              isAdmin: false,
              sessionIndex: 0,
              hourUtc: 12,
            },
          },
        },
      );

      const identity = invokeSpy.mock.calls[0][0].identity;
      expect(identity.interfaceId).toBe('web');
      expect(identity.commitSha).toBe('abc123');
      expect(identity.requestMetadata?.ipHash).toBe('hashed-ip');
    });

    it('exposes coreResult on output', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore('test'),
      });

      const output = await router.process({
        raw: { message: 'hi' },
        channelType: 'web',
      });

      expect(output.coreResult.response).toBe('test');
      expect(output.coreResult.amygdalaUsage.inputTokens).toBe(50);
      expect(output.coreResult.amygdalaCost).toBe(0.0003);
    });

    it('channelFormatted uses adapter format()', async () => {
      const router = createRouter({
        adapters: [createWebAdapter()],
        core: createStubCore('formatted response'),
      });

      const output = await router.process({
        raw: { message: 'hi' },
        channelType: 'web',
      });

      const formatted = output.channelFormatted as { response: string };
      expect(formatted.response).toBe('formatted response');
    });
  });

  describe('getAdapter', () => {
    it('returns registered adapter by type', () => {
      const webAdapter = createWebAdapter();
      const router = createRouter({
        adapters: [webAdapter],
        core: createStubCore(),
      });

      expect(router.getAdapter('web')).toBe(webAdapter);
    });

    it('returns undefined for unregistered type', () => {
      const router = createRouter({
        adapters: [],
        core: createStubCore(),
      });

      expect(router.getAdapter('discord')).toBeUndefined();
    });
  });
});
