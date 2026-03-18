import { describe, it, expect } from 'vitest';
import { sanitizeEvent, sanitizeSessionEvent } from '../src/lib/sanitize-event';
import type { TraceEvent } from '@loopcommons/llm';

// Minimal mock types matching the shapes sanitizeEvent handles
function makeRound(extra: Record<string, unknown> = {}) {
  return {
    messages: [{ role: 'user' as const, content: 'hello' }],
    response: {
      id: 'msg_123',
      type: 'message' as const,
      role: 'assistant' as const,
      content: [{ type: 'text' as const, text: 'Hi!' }],
      model: 'claude-haiku-4-5',
      stop_reason: 'end_turn' as const,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 5, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      rawResponse: { headers: { 'x-secret': 'leak' } },
      ...extra,
    },
  };
}

describe('sanitizeEvent', () => {
  it('strips rawResponse from round:complete events', () => {
    const event: TraceEvent = {
      type: 'round:complete',
      round: makeRound() as any,
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect(sanitized.type).toBe('round:complete');
    expect((sanitized as any).round.response.rawResponse).toBeUndefined();
    // Original data preserved
    expect((sanitized as any).round.response.id).toBe('msg_123');
  });

  it('strips rawResponse and system prompt from trace:complete events', () => {
    const event: TraceEvent = {
      type: 'trace:complete',
      trace: {
        system: 'TOP SECRET SYSTEM PROMPT',
        rounds: [makeRound() as any],
        model: 'claude-haiku-4-5',
        cost: 0.001,
      },
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect((sanitized as any).trace.system).toBeUndefined();
    expect((sanitized as any).trace.rounds[0].response.rawResponse).toBeUndefined();
    expect((sanitized as any).trace.model).toBe('claude-haiku-4-5');
  });

  it('redacts detailed error from tool:complete events', () => {
    const event: TraceEvent = {
      type: 'tool:complete',
      execution: {
        toolName: 'get_resume',
        input: {},
        output: 'some output',
        error: 'ENOENT: /secret/path/to/file',
        durationMs: 100,
      },
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect((sanitized as any).execution.error).toBe('Tool execution failed');
    expect((sanitized as any).execution.toolName).toBe('get_resume');
  });

  it('preserves tool:complete output when no error', () => {
    const event: TraceEvent = {
      type: 'tool:complete',
      execution: {
        toolName: 'get_resume',
        input: {},
        output: 'Tyler is a data engineer',
        durationMs: 50,
      },
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect((sanitized as any).execution.error).toBeUndefined();
    expect((sanitized as any).execution.output).toBe('Tyler is a data engineer');
  });

  it('passes through other trace events unchanged', () => {
    const event: TraceEvent = {
      type: 'round:start',
      round: 0,
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect(sanitized).toEqual(event);
  });

  it('passes through text-delta events unchanged', () => {
    const event: TraceEvent = {
      type: 'text-delta',
      delta: 'Hello there',
      timestamp: Date.now(),
    };

    const sanitized = sanitizeEvent(event);
    expect(sanitized).toEqual(event);
  });
});

describe('sanitizeSessionEvent', () => {
  it('sanitizes trace events within session events', () => {
    const event = {
      type: 'round:complete' as const,
      round: makeRound() as any,
      timestamp: Date.now(),
    };

    const sanitized = sanitizeSessionEvent(event);
    expect((sanitized as any).round.response.rawResponse).toBeUndefined();
  });

  it('passes through web session events unchanged', () => {
    const event = {
      type: 'session:start' as const,
      sessionId: 'abc123',
      timestamp: Date.now(),
    };

    const sanitized = sanitizeSessionEvent(event);
    expect(sanitized).toEqual(event);
  });

  it('passes through amygdala events unchanged', () => {
    const event = {
      type: 'amygdala:classify' as const,
      intent: 'greeting',
      confidence: 0.95,
      timestamp: Date.now(),
    };

    const sanitized = sanitizeSessionEvent(event);
    expect(sanitized).toEqual(event);
  });

  it('passes through spend:status events unchanged', () => {
    const event = {
      type: 'spend:status' as const,
      currentSpendUsd: 0.5,
      dailyCapUsd: 5,
      remainingUsd: 4.5,
      percentUsed: 10,
      resetAtUtc: '2026-03-18T00:00:00.000Z',
      timestamp: Date.now(),
    };

    const sanitized = sanitizeSessionEvent(event);
    expect(sanitized).toEqual(event);
  });
});
