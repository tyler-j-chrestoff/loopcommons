import { describe, it, expect } from 'vitest';
import { createConflictMonitor } from '../index';
import type { ConflictMonitorInput } from '../types';
import type { ChannelMessage } from '../../router/types';

function makeMessage(text: string, channelType: 'web' | 'cli' = 'web'): ChannelMessage {
  return {
    id: 'msg-1',
    channel: {
      type: channelType,
      id: 'ch-1',
      capabilities: {
        supportsStreaming: true,
        supportsAttachments: false,
        supportsThreads: false,
        supportsReactions: false,
        supportsFormatting: 'markdown',
      },
    },
    user: { id: 'u-1', isAdmin: false, isAuthenticated: true },
    content: { text },
    timestamp: Date.now(),
  };
}

describe('ConflictMonitor', () => {
  const monitor = createConflictMonitor();

  it('returns no flags when there are no memories', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('hello'),
      memoryContext: '',
    };
    const result = monitor(input);
    expect(result.flags).toEqual([]);
    expect(result.traceEvents).toHaveLength(1);
    expect(result.traceEvents[0].type).toBe('conflict-monitor:check');
  });

  it('returns no flags when facts match', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I live in Denver'),
      memoryContext: 'User lives in Denver. User is a veteran.',
    };
    const result = monitor(input);
    expect(result.flags).toEqual([]);
  });

  it('detects contradiction between message and memory', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I live in Chicago'),
      memoryContext: 'User lives in Denver.',
    };
    const result = monitor(input);
    expect(result.flags.length).toBeGreaterThanOrEqual(1);
    expect(result.flags[0].type).toBe('memory-contradiction');
    expect(result.flags[0].severity).toBe('medium');
    expect(result.flags[0].description.toLowerCase()).toContain('denver');
    expect(result.flags[0].description.toLowerCase()).toContain('chicago');
  });

  it('does not crash on empty message', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage(''),
      memoryContext: 'User lives in Denver.',
    };
    const result = monitor(input);
    expect(result.flags).toEqual([]);
  });

  it('detects multiple contradictions', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I live in Chicago and my name is Bob'),
      memoryContext: 'User lives in Denver. User name is Alice.',
    };
    const result = monitor(input);
    expect(result.flags.length).toBeGreaterThanOrEqual(2);
  });

  it('emits trace event with correct flag count', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I live in Chicago'),
      memoryContext: 'User lives in Denver.',
    };
    const result = monitor(input);
    expect(result.traceEvents).toHaveLength(1);
    expect(result.traceEvents[0].flagsDetected).toBe(result.flags.length);
  });

  it('does not flag non-contradictory different topics', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I need help with my VA claim'),
      memoryContext: 'User lives in Denver. User is a veteran.',
    };
    const result = monitor(input);
    expect(result.flags).toEqual([]);
  });

  it('detects "lives in X" vs "lives in Y" pattern', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('I actually live in Seattle'),
      memoryContext: 'User lives in Portland.',
    };
    const result = monitor(input);
    expect(result.flags.length).toBe(1);
    expect(result.flags[0].type).toBe('memory-contradiction');
  });

  it('detects "name is X" vs "name is Y" pattern', () => {
    const input: ConflictMonitorInput = {
      message: makeMessage('my name is Sarah'),
      memoryContext: 'User name is Mike.',
    };
    const result = monitor(input);
    expect(result.flags.length).toBe(1);
    expect(result.flags[0].type).toBe('memory-contradiction');
  });
});
