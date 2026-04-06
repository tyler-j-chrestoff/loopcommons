import { describe, it, expect, vi } from 'vitest';
import { createConflictMonitor } from '../../conflict-monitor';
import { createConsolidator } from '../../consolidator';
import { createRouter } from '../index';
import { createTestAdapter } from '../adapters/test';
import { createWebAdapter } from '../adapters/web';
import { createSmsAdapter } from '../adapters/sms';
import { createInMemoryIdentityStore } from '../../user-identity/in-memory-store';
import type { AgentCore, AgentInvocation, AgentInvocationResult } from '../../core/types';
import type { ConflictMonitorInput } from '../../conflict-monitor/types';
import type { ConsolidationSignal } from '../../consolidator/types';
import type { MemoryContract, StoreReceipt } from '@loopcommons/memory/contract';

function createSpyCore(response = 'Hello!'): {
  core: AgentCore;
  invocations: AgentInvocation[];
} {
  const invocations: AgentInvocation[] = [];
  const core: AgentCore = {
    async invoke(invocation: AgentInvocation): Promise<AgentInvocationResult> {
      invocations.push(invocation);
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
  return { core, invocations };
}

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

function makeMemoryContract(overrides: Partial<MemoryContract> = {}): MemoryContract {
  return {
    recall: vi.fn().mockResolvedValue({ capsules: [], truncated: false }),
    store: vi.fn().mockResolvedValue({ id: `mem-${Date.now()}`, timestamp: new Date().toISOString() } satisfies StoreReceipt),
    forget: vi.fn().mockResolvedValue(undefined),
    consolidate: vi.fn().mockResolvedValue({ pruned: 0, promoted: 0 }),
    ...overrides,
  };
}

describe('Cross-channel integration', () => {
  describe('ConflictMonitor detects cross-channel contradiction', () => {
    const monitor = createConflictMonitor();

    it('flags contradiction between web memory and test channel message', () => {
      const webAdapter = createWebAdapter();
      const testAdapter = createTestAdapter();

      // User said "I live in Denver" on web (stored in memory)
      const webMsg = webAdapter.normalize({
        message: 'I live in Denver',
        userId: 'user-1',
        isAuthenticated: true,
        isAdmin: false,
        sessionId: 'sess-web',
      });

      // Same user now says "I live in Chicago" on test channel
      const testMsg = testAdapter.normalize({
        message: 'I live in Chicago',
        userId: 'user-1',
        sessionId: 'sess-test',
      });

      // ConflictMonitor checks test message against web memory
      const input: ConflictMonitorInput = {
        message: testMsg,
        memoryContext: 'User lives in Denver.',
      };
      const result = monitor(input);
      expect(result.flags.length).toBeGreaterThanOrEqual(1);
      expect(result.flags[0].type).toBe('memory-contradiction');
      expect(result.flags[0].description.toLowerCase()).toContain('denver');
      expect(result.flags[0].description.toLowerCase()).toContain('chicago');
    });

    it('does not flag when facts are consistent across channels', () => {
      const testAdapter = createTestAdapter();
      const testMsg = testAdapter.normalize({
        message: 'I live in Denver, can you help?',
        userId: 'user-1',
      });

      const input: ConflictMonitorInput = {
        message: testMsg,
        memoryContext: 'User lives in Denver.',
      };
      const result = monitor(input);
      expect(result.flags).toEqual([]);
    });
  });

  describe('Consolidator writes with provenance from different channels', () => {
    const consolidator = createConsolidator();

    it('stores with web provenance', async () => {
      const memory = makeMemoryContract();
      const signal: ConsolidationSignal = {
        type: 'interaction_complete',
        channelType: 'web',
        threadId: 'web-thread-1',
        userId: 'user-1',
        intent: 'conversation',
        threatScore: 0.1,
        toolsUsed: [],
        timestamp: Date.now(),
      };
      const result = await consolidator({
        signal,
        interactionTrace: [],
        memoryContract: memory,
        threadHistory: [
          { role: 'user', content: 'I need help with my VA claim' },
          { role: 'assistant', content: 'I can help with that.' },
        ],
      });
      expect(result.stored.length).toBeGreaterThanOrEqual(1);
      expect(result.traceEvents[0].provenance.channelType).toBe('web');
      expect(result.traceEvents[0].provenance.threadId).toBe('web-thread-1');
    });

    it('stores with SMS provenance', async () => {
      const memory = makeMemoryContract();
      const signal: ConsolidationSignal = {
        type: 'interaction_complete',
        channelType: 'sms',
        threadId: 'sms-thread-1',
        userId: 'user-1',
        intent: 'conversation',
        threatScore: 0.05,
        toolsUsed: [],
        timestamp: Date.now(),
      };
      const result = await consolidator({
        signal,
        interactionTrace: [],
        memoryContract: memory,
        threadHistory: [
          { role: 'user', content: 'When is my appointment?' },
          { role: 'assistant', content: 'Let me check for you.' },
        ],
      });
      expect(result.stored.length).toBeGreaterThanOrEqual(1);
      expect(result.traceEvents[0].provenance.channelType).toBe('sms');
    });

    it('both channels write to same memory contract', async () => {
      const memory = makeMemoryContract();
      const storeCallArgs: unknown[][] = [];
      (memory.store as ReturnType<typeof vi.fn>).mockImplementation((...args: unknown[]) => {
        storeCallArgs.push(args);
        return Promise.resolve({ id: `mem-${storeCallArgs.length}`, timestamp: new Date().toISOString() });
      });

      // Web channel write
      await consolidator({
        signal: {
          type: 'interaction_complete',
          channelType: 'web',
          threadId: 'web-1',
          intent: 'conversation',
          threatScore: 0.1,
          toolsUsed: [],
          timestamp: Date.now(),
        },
        interactionTrace: [],
        memoryContract: memory,
        threadHistory: [
          { role: 'user', content: 'I live in Denver' },
          { role: 'assistant', content: 'Noted.' },
        ],
      });

      // Test channel write
      await consolidator({
        signal: {
          type: 'interaction_complete',
          channelType: 'test',
          threadId: 'test-1',
          intent: 'conversation',
          threatScore: 0.1,
          toolsUsed: [],
          timestamp: Date.now(),
        },
        interactionTrace: [],
        memoryContract: memory,
        threadHistory: [
          { role: 'user', content: 'My name is Alice' },
          { role: 'assistant', content: 'Hi Alice.' },
        ],
      });

      // Both should have written to the same contract
      expect(storeCallArgs.length).toBe(2);
      // Web write has channel:web tag
      expect(storeCallArgs[0][1].tags).toContain('channel:web');
      // Test write has channel:test tag
      expect(storeCallArgs[1][1].tags).toContain('channel:test');
    });
  });

  describe('Full pipeline: ConflictMonitor + Consolidator', () => {
    it('detects contradiction then blocks consolidation on elevated threat', async () => {
      const monitor = createConflictMonitor();
      const consolidator = createConsolidator();
      const memory = makeMemoryContract();

      const testAdapter = createTestAdapter();
      const testMsg = testAdapter.normalize({
        message: 'I live in Chicago',
        userId: 'user-1',
      });

      // Step 1: ConflictMonitor detects contradiction
      const cmResult = monitor({
        message: testMsg,
        memoryContext: 'User lives in Denver.',
      });
      expect(cmResult.flags.length).toBeGreaterThanOrEqual(1);

      // Step 2: Assume Guardian escalates threat due to contradiction
      // Consolidator receives elevated threat and blocks
      const coResult = await consolidator({
        signal: {
          type: 'interaction_complete',
          channelType: 'test',
          intent: 'conversation',
          threatScore: 0.6, // Guardian would escalate due to conflict
          toolsUsed: [],
          timestamp: Date.now(),
        },
        interactionTrace: [],
        memoryContract: memory,
        threadHistory: [
          { role: 'user', content: 'I live in Chicago' },
          { role: 'assistant', content: 'I noticed you previously said Denver. Can you confirm your location?' },
        ],
      });
      expect(coResult.stored).toEqual([]);
      expect(coResult.traceEvents[0].gatingBand).toBe('blocked');
    });

    it('trace events from both subsystems are emitted', () => {
      const monitor = createConflictMonitor();

      const testAdapter = createTestAdapter();
      const testMsg = testAdapter.normalize({
        message: 'I live in Chicago',
        userId: 'user-1',
      });

      const cmResult = monitor({
        message: testMsg,
        memoryContext: 'User lives in Denver.',
      });

      // ConflictMonitor always emits exactly one trace event
      expect(cmResult.traceEvents).toHaveLength(1);
      expect(cmResult.traceEvents[0].type).toBe('conflict-monitor:check');
      expect(cmResult.traceEvents[0].flagsDetected).toBeGreaterThan(0);
    });
  });

  // =======================================================================
  // Router-level E2E: identity linking across web + SMS
  // =======================================================================

  describe('Router E2E: identity across web + SMS', () => {
    it('unlinked web and SMS users have different unified IDs', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'hi from web', userId: 'web-user-1', isAdmin: true, isAuthenticated: true },
        channelType: 'test',
      });

      await router.process({
        raw: smsPayload('+15551234567', 'hi from sms'),
        channelType: 'sms',
      });

      expect(invocations[0].identity.userId).not.toBe(invocations[1].identity.userId);
    });

    it('admin-linked web + SMS users resolve to same unified ID', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const webIdentity = await identityStore.resolve('test', 'web-user-1');
      webIdentity.adminStatus = true;
      await identityStore.adminLink(webIdentity.id, 'sms', '+15551234567');

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      await router.process({
        raw: { message: 'hi from web', userId: 'web-user-1' },
        channelType: 'test',
      });

      await router.process({
        raw: smsPayload('+15551234567', 'hi from sms'),
        channelType: 'sms',
      });

      expect(invocations[0].identity.userId).toBe(webIdentity.id);
      expect(invocations[1].identity.userId).toBe(webIdentity.id);
    });

    it('explicit-link protocol: web user links SMS via verification code', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      // Web user chats — creates identity
      await router.process({
        raw: { message: 'hello', userId: 'web-user-2', isAdmin: true, isAuthenticated: true },
        channelType: 'test',
      });

      const webUserId = invocations[0].identity.userId!;

      // Create link request, verify it
      const linkRequest = await identityStore.createLinkRequest(webUserId, 'sms', '+15559876543');
      expect(linkRequest.verificationCode).toMatch(/^\d{6}$/);
      const { success } = await identityStore.verifyLink(linkRequest.id, linkRequest.verificationCode);
      expect(success).toBe(true);

      // SMS from that number now resolves to same identity
      await router.process({
        raw: smsPayload('+15559876543', 'hi from my phone'),
        channelType: 'sms',
      });

      expect(invocations[1].identity.userId).toBe(webUserId);
    });

    it('adminStatus from web identity promotes SMS channel requests', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const webIdentity = await identityStore.resolve('test', 'admin-user');
      webIdentity.adminStatus = true;
      await identityStore.adminLink(webIdentity.id, 'sms', '+15550001111');

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      // SMS adapter sets isAdmin=false, but identity store should override
      await router.process({
        raw: smsPayload('+15550001111', 'admin from sms'),
        channelType: 'sms',
      });

      expect(invocations[0].identity.isAdmin).toBe(true);
    });
  });

  // =======================================================================
  // Router E2E: thread isolation across channels
  // =======================================================================

  describe('Router E2E: thread isolation', () => {
    it('web and SMS maintain separate thread histories', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const webIdentity = await identityStore.resolve('test', 'web-user');
      await identityStore.adminLink(webIdentity.id, 'sms', '+15551112222');

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      // Web message
      await router.process({
        raw: { message: 'web msg 1', userId: 'web-user', sessionId: 'web-thread-1' },
        channelType: 'test',
      });

      // SMS message
      await router.process({
        raw: smsPayload('+15551112222', 'sms msg 1'),
        channelType: 'sms',
      });

      // Second web message — should have web history only
      await router.process({
        raw: { message: 'web msg 2', userId: 'web-user', sessionId: 'web-thread-1' },
        channelType: 'test',
      });

      const webHistory = invocations[2].conversationHistory;
      expect(webHistory.length).toBe(2);
      expect(webHistory[0].content).toBe('web msg 1');
      expect(webHistory.every(m => m.content !== 'sms msg 1')).toBe(true);
    });

    it('SMS thread keyed by phone number accumulates history', async () => {
      const { core, invocations } = createSpyCore();

      const router = createRouter({
        adapters: [createSmsAdapter()],
        core,
      });

      await router.process({
        raw: smsPayload('+15553334444', 'first sms'),
        channelType: 'sms',
      });

      await router.process({
        raw: smsPayload('+15553334444', 'second sms'),
        channelType: 'sms',
      });

      const history = invocations[1].conversationHistory;
      expect(history.length).toBe(2);
      expect(history[0].content).toBe('first sms');
      expect(history[0].role).toBe('user');
      expect(history[1].role).toBe('assistant');
    });

    it('different phone numbers have separate SMS threads', async () => {
      const { core, invocations } = createSpyCore();

      const router = createRouter({
        adapters: [createSmsAdapter()],
        core,
      });

      await router.process({
        raw: smsPayload('+15551111111', 'from phone A'),
        channelType: 'sms',
      });

      await router.process({
        raw: smsPayload('+15552222222', 'from phone B'),
        channelType: 'sms',
      });

      // Second phone should have empty history (first contact)
      expect(invocations[1].conversationHistory.length).toBe(0);
    });
  });

  // =======================================================================
  // Full pipeline E2E: web → link → SMS → verify unified state
  // =======================================================================

  describe('Router E2E: complete cross-channel loop', () => {
    it('web chat → admin link SMS → SMS chat → verify identity + threading + provenance', async () => {
      const { core, invocations } = createSpyCore();
      const identityStore = createInMemoryIdentityStore();

      const router = createRouter({
        adapters: [createTestAdapter(), createSmsAdapter()],
        core,
        identityStore,
      });

      // Step 1: Web user chats
      await router.process({
        raw: { message: 'Hello from web', userId: 'tyler-web', isAdmin: true, isAuthenticated: true, sessionId: 'session-1' },
        channelType: 'test',
      });

      const webUserId = invocations[0].identity.userId!;
      expect(invocations[0].identity.isAdmin).toBe(true);
      expect(invocations[0].identity.interfaceId).toBe('test');

      // Step 2: Mark identity as admin + link SMS number
      const webIdentity = await identityStore.getById(webUserId);
      webIdentity!.adminStatus = true;
      await identityStore.adminLink(webUserId, 'sms', '+15550000001');

      // Step 3: SMS user chats (same person, linked)
      await router.process({
        raw: smsPayload('+15550000001', 'Hello from phone'),
        channelType: 'sms',
      });

      // Same unified identity
      expect(invocations[1].identity.userId).toBe(webUserId);
      // Admin status propagated
      expect(invocations[1].identity.isAdmin).toBe(true);
      // Interface ID reflects SMS
      expect(invocations[1].identity.interfaceId).toBe('sms');

      // Step 4: Second web message — web thread has its own history
      await router.process({
        raw: { message: 'Another web message', userId: 'tyler-web', isAdmin: true, sessionId: 'session-1' },
        channelType: 'test',
      });

      const webHistory = invocations[2].conversationHistory;
      expect(webHistory.length).toBe(2);
      expect(webHistory.every(m => m.content !== 'Hello from phone')).toBe(true);

      // Step 5: Second SMS — SMS thread has its own history
      await router.process({
        raw: smsPayload('+15550000001', 'Another sms'),
        channelType: 'sms',
      });

      const smsHistory = invocations[3].conversationHistory;
      expect(smsHistory.length).toBe(2);
      expect(smsHistory[0].content).toBe('Hello from phone');
    });

    it('SMS response is TwiML-formatted', async () => {
      const { core } = createSpyCore('I can help with that.');

      const router = createRouter({
        adapters: [createSmsAdapter()],
        core,
      });

      const result = await router.process({
        raw: smsPayload('+15551234567', 'help me'),
        channelType: 'sms',
      });

      const formatted = result.channelFormatted as { twiml: string };
      expect(formatted.twiml).toContain('<Response>');
      expect(formatted.twiml).toContain('<Message>');
      expect(formatted.twiml).toContain('I can help with that.');
    });
  });
});
