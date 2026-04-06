import { describe, it, expect, vi } from 'vitest';
import { createRouter } from '../index';
import { createTestAdapter } from '../adapters/test';
import { createInMemoryIdentityStore } from '../../user-identity/in-memory-store';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';
import type { IdentityStore } from '../../user-identity/types';

function createStubCore(response = 'Hello!'): AgentCore {
  return {
    async invoke(_invocation: AgentInvocation): Promise<AgentInvocationResult> {
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

describe('Router identity integration', () => {
  describe('without identityStore (regression)', () => {
    it('works exactly as before — userId comes from channel message', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');

      const router = createRouter({
        adapters: [createTestAdapter()],
        core,
      });

      await router.process({
        raw: { message: 'hi', userId: 'raw-user-123', isAdmin: false },
        channelType: 'test',
      });

      const identity = invokeSpy.mock.calls[0][0].identity;
      expect(identity.userId).toBe('raw-user-123');
      expect(identity.isAdmin).toBe(false);
    });
  });

  describe('with identityStore', () => {
    it('calls resolve and replaces userId with unified identity id', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'hi', userId: 'phone-user', isAdmin: false },
        channelType: 'test',
      });

      const identity = invokeSpy.mock.calls[0][0].identity;
      // userId should be the unified identity id (a UUID), not the raw channel user id
      expect(identity.userId).not.toBe('phone-user');
      expect(identity.userId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('same channel user on different requests resolves to same unified identity', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'first', userId: '+15551234567', isAdmin: false },
        channelType: 'test',
      });

      await router.process({
        raw: { message: 'second', userId: '+15551234567', isAdmin: false },
        channelType: 'test',
      });

      const firstId = invokeSpy.mock.calls[0][0].identity.userId;
      const secondId = invokeSpy.mock.calls[1][0].identity.userId;
      expect(firstId).toBe(secondId);
    });

    it('linked identities from different channels resolve to same unified ID', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      // Pre-resolve a web user to create their identity
      const webIdentity = await identityStore.resolve('web', 'web-user-abc');
      // Admin-link a test channel user to the same identity
      await identityStore.adminLink(webIdentity.id, 'test', 'test-user-xyz');

      const router = createRouter({
        adapters: [createTestAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'hi from test', userId: 'test-user-xyz', isAdmin: false },
        channelType: 'test',
      });

      const identity = invokeSpy.mock.calls[0][0].identity;
      expect(identity.userId).toBe(webIdentity.id);
    });

    it('calls touch after successful processing', async () => {
      const identityStore = createInMemoryIdentityStore();
      const touchSpy = vi.spyOn(identityStore, 'touch');

      const router = createRouter({
        adapters: [createTestAdapter()],
        core: createStubCore(),
        identityStore,
      });

      await router.process({
        raw: { message: 'hi', userId: 'user-1', isAdmin: false },
        channelType: 'test',
      });

      expect(touchSpy).toHaveBeenCalledOnce();
      // touch is called with the unified identity id
      const callArg = touchSpy.mock.calls[0][0];
      expect(callArg).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('adminStatus from identity overrides channel-level isAdmin', async () => {
      const core = createStubCore();
      const invokeSpy = vi.spyOn(core, 'invoke');
      const identityStore = createInMemoryIdentityStore();

      // Create an identity and set adminStatus to true
      const userIdentity = await identityStore.resolve('test', 'admin-user');
      userIdentity.adminStatus = true;

      const router = createRouter({
        adapters: [createTestAdapter()],
        core,
        identityStore,
      });

      // Channel says isAdmin=false, but identity says adminStatus=true
      await router.process({
        raw: { message: 'hi', userId: 'admin-user', isAdmin: false },
        channelType: 'test',
      });

      const identity = invokeSpy.mock.calls[0][0].identity;
      expect(identity.isAdmin).toBe(true);
    });
  });
});
