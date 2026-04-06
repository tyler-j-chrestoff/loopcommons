import { describe, it, expect } from 'vitest';
import { buildUserPrompt } from '../index';
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
      { type: 'memory-contradiction', severity: 'medium', description: 'contradictory recall' },
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

describe('buildUserPrompt conflict flag injection', () => {
  it('includes conflict flags section when flags present', () => {
    const input: GuardianInput = {
      rawMessage: 'I live in Chicago',
      conversationHistory: [],
      conflictFlags: [
        { type: 'memory-contradiction', severity: 'medium', description: 'location contradiction: memory says "denver" but message says "chicago"' },
      ],
    };

    const prompt = buildUserPrompt(input);
    expect(prompt).toContain('## Conflict Flags');
    expect(prompt).toContain('location contradiction');
    expect(prompt).toContain('denver');
    expect(prompt).toContain('chicago');
    expect(prompt).toContain('acknowledge the conflict');
    expect(prompt).toContain('ask for clarification');
  });

  it('includes multiple conflict flags', () => {
    const input: GuardianInput = {
      rawMessage: 'My name is Bob and I work at Google',
      conversationHistory: [],
      conflictFlags: [
        { type: 'memory-contradiction', severity: 'medium', description: 'name contradiction: memory says "alice" but message says "bob"' },
        { type: 'memory-contradiction', severity: 'medium', description: 'employer contradiction: memory says "acme" but message says "google"' },
      ],
    };

    const prompt = buildUserPrompt(input);
    expect(prompt).toContain('name contradiction');
    expect(prompt).toContain('employer contradiction');
  });

  it('omits conflict flags section when no flags', () => {
    const input: GuardianInput = {
      rawMessage: 'hello',
      conversationHistory: [],
    };

    const prompt = buildUserPrompt(input);
    expect(prompt).not.toContain('## Conflict Flags');
  });

  it('omits conflict flags section when empty array', () => {
    const input: GuardianInput = {
      rawMessage: 'hello',
      conversationHistory: [],
      conflictFlags: [],
    };

    const prompt = buildUserPrompt(input);
    expect(prompt).not.toContain('## Conflict Flags');
  });

  it('conflict flags appear between memory context and request metadata', () => {
    const input: GuardianInput = {
      rawMessage: 'I live in Chicago',
      conversationHistory: [],
      memoryContext: 'User lives in Denver.',
      conflictFlags: [
        { type: 'memory-contradiction', severity: 'medium', description: 'location mismatch' },
      ],
      requestMetadata: {
        ipHash: 'abc123',
        isAuthenticated: true,
        isAdmin: false,
        sessionIndex: 1,
        hourUtc: 14,
      },
    };

    const prompt = buildUserPrompt(input);
    const memoryIdx = prompt.indexOf('## Memory Context');
    const conflictIdx = prompt.indexOf('## Conflict Flags');
    const metadataIdx = prompt.indexOf('## Request Metadata');
    const messageIdx = prompt.indexOf('## Current User Message');

    expect(memoryIdx).toBeLessThan(conflictIdx);
    expect(conflictIdx).toBeLessThan(metadataIdx);
    expect(metadataIdx).toBeLessThan(messageIdx);
  });
});
