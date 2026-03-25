import { describe, it, expect, vi } from 'vitest';
import { createConflictMonitor } from '../../conflict-monitor';
import { createConsolidator } from '../../consolidator';
import { createTestAdapter } from '../adapters/test';
import { createWebAdapter } from '../adapters/web';
import type { ConflictMonitorInput } from '../../conflict-monitor/types';
import type { ConsolidationSignal } from '../../consolidator/types';
import type { MemoryContract, StoreReceipt } from '@loopcommons/memory/contract';

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
});
