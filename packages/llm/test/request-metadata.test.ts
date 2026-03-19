/**
 * request-metadata.test.ts — Tests for request metadata in AmygdalaInput.
 *
 * soul-04: Request metadata (IP hash, auth status, session count, time-of-day)
 * flows into the amygdala as identity consistency signals.
 *
 * Tests:
 *   - Metadata is included in the user prompt when provided
 *   - Metadata is optional (backward compatibility)
 *   - hashForPrivacy produces consistent SHA-256 hashes
 *   - Raw IP is never present in the prompt
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'mock-model')),
}));

import { generateObject } from 'ai';
import { createAmygdala } from '../src/amygdala';
import { hashForPrivacy } from '../src/amygdala/metadata';
import type { RequestMetadata } from '../src/amygdala/types';

const mockedGenerateObject = vi.mocked(generateObject);

function mockResponse() {
  return {
    object: {
      rewrittenPrompt: 'hello',
      intent: 'conversation',
      threat: { score: 0.0, category: 'none', reasoning: 'aligned' },
      contextDelegation: { historyIndices: [], annotations: [] },
      intentConfidence: 0.9,
    },
    usage: { inputTokens: 200, outputTokens: 100 },
  } as any;
}

const sampleMetadata: RequestMetadata = {
  ipHash: 'abc123def456',
  isAuthenticated: true,
  isAdmin: true,
  sessionIndex: 5,
  hourUtc: 14,
  userAgentHash: 'ua-hash-789',
};

describe('Request metadata', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes metadata in the user prompt when provided', async () => {
    mockedGenerateObject.mockResolvedValueOnce(mockResponse());

    const amygdala = createAmygdala();
    await amygdala({
      rawMessage: 'hello',
      conversationHistory: [],
      requestMetadata: sampleMetadata,
    });

    // Check the prompt passed to generateObject
    const call = mockedGenerateObject.mock.calls[0]![0] as any;
    const prompt: string = call.prompt;

    expect(prompt).toContain('## Request Metadata');
    expect(prompt).toContain('authenticated: true');
    expect(prompt).toContain('admin: true');
    expect(prompt).toContain('sessionIndex: 5');
    expect(prompt).toContain('hourUtc: 14');
  });

  it('does not include metadata section when not provided', async () => {
    mockedGenerateObject.mockResolvedValueOnce(mockResponse());

    const amygdala = createAmygdala();
    await amygdala({
      rawMessage: 'hello',
      conversationHistory: [],
    });

    const call = mockedGenerateObject.mock.calls[0]![0] as any;
    const prompt: string = call.prompt;

    expect(prompt).not.toContain('## Request Metadata');
  });

  it('never includes raw IP address in the prompt', async () => {
    mockedGenerateObject.mockResolvedValueOnce(mockResponse());

    const rawIp = '192.168.1.42';
    const metadata: RequestMetadata = {
      ...sampleMetadata,
      ipHash: hashForPrivacy(rawIp),
    };

    const amygdala = createAmygdala();
    await amygdala({
      rawMessage: 'hello',
      conversationHistory: [],
      requestMetadata: metadata,
    });

    const call = mockedGenerateObject.mock.calls[0]![0] as any;
    const prompt: string = call.prompt;

    // Raw IP must never appear
    expect(prompt).not.toContain(rawIp);

    // Hash should appear instead
    expect(prompt).toContain(metadata.ipHash);
  });

  it('includes ipHash and userAgentHash in prompt', async () => {
    mockedGenerateObject.mockResolvedValueOnce(mockResponse());

    const amygdala = createAmygdala();
    await amygdala({
      rawMessage: 'hello',
      conversationHistory: [],
      requestMetadata: sampleMetadata,
    });

    const call = mockedGenerateObject.mock.calls[0]![0] as any;
    const prompt: string = call.prompt;

    expect(prompt).toContain('ipHash: abc123def456');
    expect(prompt).toContain('userAgentHash: ua-hash-789');
  });

  it('omits userAgentHash line when not provided', async () => {
    mockedGenerateObject.mockResolvedValueOnce(mockResponse());

    const metadataNoUa: RequestMetadata = {
      ...sampleMetadata,
      userAgentHash: undefined,
    };

    const amygdala = createAmygdala();
    await amygdala({
      rawMessage: 'hello',
      conversationHistory: [],
      requestMetadata: metadataNoUa,
    });

    const call = mockedGenerateObject.mock.calls[0]![0] as any;
    const prompt: string = call.prompt;

    expect(prompt).not.toContain('userAgentHash');
  });
});

describe('hashForPrivacy', () => {
  it('produces a consistent hash for the same input', () => {
    const hash1 = hashForPrivacy('192.168.1.1');
    const hash2 = hashForPrivacy('192.168.1.1');
    expect(hash1).toBe(hash2);
  });

  it('produces different hashes for different inputs', () => {
    const hash1 = hashForPrivacy('192.168.1.1');
    const hash2 = hashForPrivacy('10.0.0.1');
    expect(hash1).not.toBe(hash2);
  });

  it('returns a hex string (SHA-256 format)', () => {
    const hash = hashForPrivacy('test-input');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does not contain the original input', () => {
    const input = '192.168.1.42';
    const hash = hashForPrivacy(input);
    expect(hash).not.toContain(input);
  });
});
