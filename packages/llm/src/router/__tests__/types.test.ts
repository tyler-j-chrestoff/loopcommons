import { describe, it, expect } from 'vitest';
import type {
  ChannelType,
  ChannelCapabilities,
  ChannelOrigin,
  UserRef,
  ThreadRef,
  Attachment,
  MessageContent,
  ChannelMessage,
  ChannelResponse,
  ChannelAdapter,
  RouterConfig,
  RouterInput,
  RouterOutput,
} from '../types';
import type { AgentInvocation, AgentInvocationResult } from '../../core/types';
import type { TraceEvent } from '../../trace/events';
import type { AmygdalaResult } from '../../amygdala/types';

describe('Router types', () => {
  describe('ChannelMessage', () => {
    it('is structurally constructable', () => {
      const msg: ChannelMessage = {
        id: 'msg-001',
        channel: {
          type: 'web',
          id: 'web-main',
          capabilities: {
            supportsStreaming: true,
            supportsAttachments: false,
            supportsThreads: true,
            supportsReactions: false,
            supportsFormatting: 'markdown',
          },
        },
        user: { id: 'user-abc', isAdmin: false, isAuthenticated: true },
        content: { text: 'Hello agent' },
        timestamp: Date.now(),
      };

      expect(msg.id).toBe('msg-001');
      expect(msg.channel.type).toBe('web');
      expect(msg.user.isAdmin).toBe(false);
      expect(msg.content.text).toBe('Hello agent');
    });

    it('supports optional thread and attachments', () => {
      const msg: ChannelMessage = {
        id: 'msg-002',
        channel: {
          type: 'cli',
          id: 'cli-local',
          capabilities: {
            supportsStreaming: true,
            supportsAttachments: false,
            supportsThreads: true,
            supportsReactions: false,
            supportsFormatting: 'markdown',
          },
        },
        user: { id: 'admin', isAdmin: true, isAuthenticated: true },
        thread: { id: 'thread-1' },
        content: {
          text: 'Check this image',
          attachments: [{ type: 'image', url: 'https://example.com/img.png' }],
        },
        timestamp: Date.now(),
      };

      expect(msg.thread?.id).toBe('thread-1');
      expect(msg.content.attachments?.[0].type).toBe('image');
    });
  });

  describe('ChannelResponse', () => {
    it('is structurally constructable', () => {
      const resp: ChannelResponse = {
        messageId: 'msg-001',
        content: { text: 'Hello! How can I help?' },
        traceEvents: [],
        usage: { inputTokens: 100, outputTokens: 50 },
        cost: 0.001,
        subagentId: 'conversational',
        subagentName: 'Conversational',
        guardianAssessment: {
          rewrittenPrompt: 'Hello agent',
          intent: 'conversation',
          threat: { score: 0.0, category: 'none', reasoning: 'Friendly greeting' },
          contextDelegation: { historyIndices: [], annotations: [] },
          traceEvents: [],
          latencyMs: 50,
          usage: { inputTokens: 80, outputTokens: 30, cachedTokens: 0 },
          cost: 0.0005,
        },
      };

      expect(resp.messageId).toBe('msg-001');
      expect(resp.guardianAssessment.threat.score).toBe(0.0);
    });
  });

  describe('ChannelAdapter interface', () => {
    it('can be implemented with normalize and format', () => {
      const adapter: ChannelAdapter = {
        type: 'web',
        capabilities: {
          supportsStreaming: true,
          supportsAttachments: false,
          supportsThreads: true,
          supportsReactions: false,
          supportsFormatting: 'markdown',
        },
        normalize(raw: unknown): ChannelMessage {
          const r = raw as { message: string; userId: string };
          return {
            id: 'generated-id',
            channel: { type: 'web', id: 'web-main', capabilities: this.capabilities },
            user: { id: r.userId, isAdmin: false, isAuthenticated: true },
            content: { text: r.message },
            timestamp: Date.now(),
          };
        },
        format(response: ChannelResponse): unknown {
          return { text: response.content.text };
        },
      };

      const msg = adapter.normalize({ message: 'hi', userId: 'u1' });
      expect(msg.content.text).toBe('hi');
      expect(msg.channel.type).toBe('web');

      const formatted = adapter.format({
        messageId: 'x',
        content: { text: 'response' },
        traceEvents: [],
        usage: { inputTokens: 0, outputTokens: 0 },
        cost: 0,
        subagentId: 'test',
        subagentName: 'Test',
        guardianAssessment: {
          rewrittenPrompt: '',
          intent: 'conversation',
          threat: { score: 0, category: 'none', reasoning: '' },
          contextDelegation: { historyIndices: [], annotations: [] },
          traceEvents: [],
          latencyMs: 0,
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
          cost: 0,
        },
      });
      expect((formatted as { text: string }).text).toBe('response');
    });
  });

  describe('structural compatibility with existing types', () => {
    it('ChannelMessage.content.text maps to AgentInvocation.message', () => {
      const channelMsg: ChannelMessage = {
        id: 'msg-compat',
        channel: {
          type: 'web',
          id: 'web-1',
          capabilities: {
            supportsStreaming: true,
            supportsAttachments: false,
            supportsThreads: true,
            supportsReactions: false,
            supportsFormatting: 'markdown',
          },
        },
        user: { id: 'u1', isAdmin: false, isAuthenticated: true },
        content: { text: 'What is Loop Commons?' },
        timestamp: Date.now(),
      };

      // Router will construct AgentInvocation from ChannelMessage
      const invocation: AgentInvocation = {
        message: channelMsg.content.text,
        conversationHistory: [],
        identity: {
          interfaceId: channelMsg.channel.type,
          isAdmin: channelMsg.user.isAdmin,
          isAuthenticated: channelMsg.user.isAuthenticated,
          userId: channelMsg.user.id,
        },
      };

      expect(invocation.message).toBe(channelMsg.content.text);
      expect(invocation.identity.interfaceId).toBe('web');
    });

    it('AgentInvocationResult maps to ChannelResponse', () => {
      const coreResult: AgentInvocationResult = {
        response: 'Loop Commons is a research platform.',
        traceEvents: [] as TraceEvent[],
        usage: { inputTokens: 200, outputTokens: 100 },
        cost: 0.002,
        subagentId: 'project',
        subagentName: 'Project',
        amygdalaUsage: { inputTokens: 80, outputTokens: 30 },
        amygdalaCost: 0.0005,
      };

      const guardianAssessment: AmygdalaResult = {
        rewrittenPrompt: 'What is Loop Commons?',
        intent: 'project',
        threat: { score: 0.0, category: 'none', reasoning: 'Genuine question' },
        contextDelegation: { historyIndices: [0], annotations: [] },
        traceEvents: [],
        latencyMs: 45,
        usage: { inputTokens: 80, outputTokens: 30, cachedTokens: 0 },
        cost: 0.0005,
      };

      // Router will construct ChannelResponse from AgentInvocationResult
      const channelResp: ChannelResponse = {
        messageId: 'msg-compat',
        content: { text: coreResult.response },
        traceEvents: coreResult.traceEvents,
        usage: coreResult.usage,
        cost: coreResult.cost,
        subagentId: coreResult.subagentId,
        subagentName: coreResult.subagentName,
        guardianAssessment,
      };

      expect(channelResp.content.text).toBe(coreResult.response);
      expect(channelResp.cost).toBe(coreResult.cost);
    });
  });

  describe('RouterConfig', () => {
    it('accepts adapters and pipeline config', () => {
      const config: RouterConfig = {
        adapters: [],
        pipeline: {
          toolPackages: [],
        },
      };

      expect(config.adapters).toHaveLength(0);
      expect(config.pipeline.toolPackages).toHaveLength(0);
    });
  });

  describe('ChannelType', () => {
    it('includes web, cli, discord, whatsapp, sms', () => {
      const types: ChannelType[] = ['web', 'cli', 'discord', 'whatsapp', 'sms'];
      expect(types).toHaveLength(5);
    });
  });
});
