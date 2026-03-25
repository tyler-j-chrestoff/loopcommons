import { describe, it, expect } from 'vitest';
import type { GuardianInput, SubstrateReport, ConflictFlag } from '../types';
import type { ChannelType, ChannelCapabilities } from '../../router/types';

describe('GuardianInput forward-compatible fields', () => {
  const baseInput: GuardianInput = {
    rawMessage: 'hello',
    conversationHistory: [],
  };

  it('accepts channelType', () => {
    const input: GuardianInput = {
      ...baseInput,
      channelType: 'web' as ChannelType,
    };
    expect(input.channelType).toBe('web');
  });

  it('accepts channelCapabilities', () => {
    const caps: ChannelCapabilities = {
      supportsStreaming: true,
      supportsAttachments: false,
      supportsThreads: false,
      supportsReactions: false,
      supportsFormatting: 'markdown',
    };
    const input: GuardianInput = {
      ...baseInput,
      channelCapabilities: caps,
    };
    expect(input.channelCapabilities?.supportsStreaming).toBe(true);
  });

  it('accepts substrateReport placeholder', () => {
    const report: SubstrateReport = {
      tokenPressure: 0.3,
      contextUtilization: 0.5,
    };
    const input: GuardianInput = {
      ...baseInput,
      substrateReport: report,
    };
    expect(input.substrateReport?.tokenPressure).toBe(0.3);
  });

  it('accepts conflictFlags placeholder', () => {
    const flags: ConflictFlag[] = [
      { source: 'memory', description: 'contradictory recall' },
    ];
    const input: GuardianInput = {
      ...baseInput,
      conflictFlags: flags,
    };
    expect(input.conflictFlags).toHaveLength(1);
  });

  it('works without any optional fields (backwards compatible)', () => {
    expect(baseInput.channelType).toBeUndefined();
    expect(baseInput.substrateReport).toBeUndefined();
    expect(baseInput.conflictFlags).toBeUndefined();
  });
});
