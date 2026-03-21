import { describe, it, expect, vi } from 'vitest';
import { createLiveAgentFn } from '../../src/arena/live-agent';
import { createSandboxTools, createDoneTool } from '../../src/arena/sandbox-tools';
import type { Sandbox } from '../../src/arena/types';

/**
 * Unit tests for live agent done tool + toolChoice:required behavior.
 * These tests mock the AI SDK to verify wiring, not LLM behavior.
 */

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  tool: vi.fn((config: any) => config),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => vi.fn(() => 'mock-model')),
}));

import { generateText } from 'ai';

const mockGenerateText = vi.mocked(generateText);

function makeSandbox(): Sandbox {
  return {
    files: new Map([['config.yaml', 'key: value']]),
    services: new Map([
      ['app', { status: 'running', config: {}, metrics: {}, logs: [] }],
    ]),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  };
}

describe('createLiveAgentFn', () => {
  describe('toolChoice: required', () => {
    it('passes toolChoice "required" to generateText', async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '',
        steps: [],
      } as any);

      const agentFn = createLiveAgentFn('test-key');
      const sandbox = makeSandbox();
      const tools = [...createSandboxTools(sandbox), createDoneTool()];

      await agentFn({ prompt: 'Fix it', tools, sandbox });

      expect(mockGenerateText).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: 'required',
        }),
      );
    });
  });

  describe('done tool inclusion', () => {
    it('includes done tool in the tools passed to generateText', async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '',
        steps: [],
      } as any);

      const agentFn = createLiveAgentFn('test-key');
      const sandbox = makeSandbox();
      const tools = [...createSandboxTools(sandbox), createDoneTool()];

      await agentFn({ prompt: 'Fix it', tools, sandbox });

      const callArgs = mockGenerateText.mock.calls[0][0] as any;
      expect(callArgs.tools).toHaveProperty('done');
    });
  });

  describe('system prompt', () => {
    it('instructs agent to call done when finished', async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '',
        steps: [],
      } as any);

      const agentFn = createLiveAgentFn('test-key');
      const sandbox = makeSandbox();
      const tools = [...createSandboxTools(sandbox), createDoneTool()];

      await agentFn({ prompt: 'Fix it', tools, sandbox });

      const callArgs = mockGenerateText.mock.calls[0][0] as any;
      expect(callArgs.system).toContain('done');
    });
  });

  describe('done tool extraction', () => {
    it('extracts done tool call from steps like any other tool', async () => {
      mockGenerateText.mockResolvedValueOnce({
        text: '',
        steps: [
          {
            toolCalls: [
              { toolCallId: 'tc1', toolName: 'inspect', args: { target: 'ls' } },
            ],
          },
          {
            toolCalls: [
              { toolCallId: 'tc2', toolName: 'done', args: {} },
            ],
          },
        ],
      } as any);

      const agentFn = createLiveAgentFn('test-key');
      const sandbox = makeSandbox();
      const tools = [...createSandboxTools(sandbox), createDoneTool()];

      const result = await agentFn({ prompt: 'Fix it', tools, sandbox });

      const toolNames = result.toolCalls.map(tc => tc.toolName);
      expect(toolNames).toContain('done');
    });
  });
});
