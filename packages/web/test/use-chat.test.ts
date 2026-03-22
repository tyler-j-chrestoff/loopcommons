import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '@/lib/use-chat';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSSEResponse(
  events: Array<Record<string, unknown>>,
  headers?: Record<string, string>,
): Response {
  const lines = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(lines));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'X-Session-Id': 'test-session-123',
      ...headers,
    },
  });
}

function createErrorResponse(status: number, body: { error: string }): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

let fetchSpy: ReturnType<typeof vi.spyOn>;

// happy-dom localStorage is not a full Storage implementation.
// Provide a simple mock on globalThis.
const storage: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => { storage[key] = value; },
  removeItem: (key: string) => { delete storage[key]; },
  clear: () => { for (const k of Object.keys(storage)) delete storage[k]; },
  get length() { return Object.keys(storage).length; },
  key: (i: number) => Object.keys(storage)[i] ?? null,
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

beforeEach(() => {
  localStorageMock.clear();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useChat', () => {
  // 1. Initial state
  it('returns empty initial state', () => {
    fetchSpy.mockResolvedValue(createSSEResponse([]));
    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.sessionId).toBeNull();
    expect(result.current.rateLimitStatus).toBeNull();
    expect(result.current.spendStatus).toBeNull();
    expect(result.current.securityEvents).toEqual([]);
    expect(result.current.liveAmygdala).toBeNull();
    expect(result.current.liveRouting).toBeNull();
    expect(result.current.trace).toBeNull();
    expect(result.current.liveRounds).toEqual([]);
  });

  // 2. send() adds user message and sets isLoading
  it('adds user message and sets isLoading on send()', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([{ type: 'done' }]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hello');
    });

    // User message should be added immediately, isLoading true
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('Hello');
    expect(result.current.isLoading).toBe(true);

    // Wait for the async response to finish
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  });

  // 2b. send() ignores empty/whitespace-only input
  it('ignores empty input on send()', () => {
    fetchSpy.mockResolvedValue(createSSEResponse([]));
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('   ');
    });

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // 3. Parses text-delta events into assistant message content
  it('parses text-delta events into assistant message', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'text-delta', delta: 'Hello', timestamp: Date.now() },
        { type: 'text-delta', delta: ' world', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Should have user + assistant messages
    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].role).toBe('assistant');
    expect(result.current.messages[1].content).toBe('Hello world');
  });

  // 4. Handles session:start event — sets sessionId state
  it('sets sessionId on session:start event', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'session:start', sessionId: 'sess-abc-123', timestamp: Date.now() },
        { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.sessionId).toBe('sess-abc-123');
    });
  });

  // 5. Stores session ID in localStorage on session:start
  it('stores session ID in localStorage on session:start', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'session:start', sessionId: 'sess-persist-456', timestamp: Date.now() },
        { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(localStorage.getItem('lastSessionId')).toBe('sess-persist-456');
  });

  // 6. Sends X-Parent-Session-Id header when localStorage has lastSessionId
  it('sends X-Parent-Session-Id header from localStorage', async () => {
    localStorage.setItem('lastSessionId', 'prev-session-789');

    fetchSpy.mockResolvedValue(
      createSSEResponse([{ type: 'done' }]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hello');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/chat',
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Parent-Session-Id': 'prev-session-789',
        }),
      }),
    );
  });

  // 7. Handles rate-limit:status event
  it('updates rateLimitStatus on rate-limit:status event', async () => {
    const rateLimitEvent = {
      type: 'rate-limit:status',
      remaining: 4,
      limit: 5,
      activeConnections: 1,
      concurrencyLimit: 2,
      resetMs: 60000,
      timestamp: Date.now(),
    };

    fetchSpy.mockResolvedValue(
      createSSEResponse([
        rateLimitEvent,
        { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.rateLimitStatus).not.toBeNull();
    });

    expect(result.current.rateLimitStatus).toEqual({
      remaining: 4,
      limit: 5,
      activeConnections: 1,
      concurrencyLimit: 2,
      resetMs: 60000,
    });
  });

  // 8. Handles spend:status event
  it('updates spendStatus on spend:status event', async () => {
    const spendEvent = {
      type: 'spend:status',
      currentSpendUsd: 0.05,
      dailyCapUsd: 1.0,
      remainingUsd: 0.95,
      percentUsed: 5,
      resetAtUtc: '2026-03-19T00:00:00Z',
      timestamp: Date.now(),
    };

    fetchSpy.mockResolvedValue(
      createSSEResponse([
        spendEvent,
        { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.spendStatus).not.toBeNull();
    });

    expect(result.current.spendStatus).toEqual({
      currentSpendUsd: 0.05,
      dailyCapUsd: 1.0,
      remainingUsd: 0.95,
      percentUsed: 5,
      resetAtUtc: '2026-03-19T00:00:00Z',
    });
  });

  // 9. Handles error event — sets error state
  it('sets error on error event from SSE stream', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'error', error: 'Something went wrong', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Something went wrong');
    });
  });

  // 9b. Handles HTTP error response
  it('sets error on non-ok HTTP response', async () => {
    fetchSpy.mockResolvedValue(
      createErrorResponse(429, { error: 'Rate limited' }),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Rate limited');
    });

    expect(result.current.isLoading).toBe(false);
  });

  // 10. Handles amygdala events
  it('accumulates amygdala classification from multiple events', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        {
          type: 'amygdala:classify',
          intent: 'question_professional',
          confidence: 0.92,
          timestamp: Date.now(),
        },
        {
          type: 'amygdala:threat-assess',
          threat: { score: 0.1, category: 'none', reasoning: 'Benign question' },
          timestamp: Date.now(),
        },
        {
          type: 'amygdala:rewrite',
          modified: false,
          originalPrompt: 'Tell me about yourself',
          rewrittenPrompt: 'Tell me about yourself',
          timestamp: Date.now(),
        },
        { type: 'text-delta', delta: 'response', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Tell me about yourself');
    });

    await waitFor(() => {
      expect(result.current.liveAmygdala).not.toBeNull();
      expect(result.current.liveAmygdala!.intent).toBeDefined();
      expect(result.current.liveAmygdala!.threatScore).toBeDefined();
      expect(result.current.liveAmygdala!.rewriteModified).toBeDefined();
    });

    expect(result.current.liveAmygdala).toEqual(
      expect.objectContaining({
        intent: 'question_professional',
        confidence: 0.92,
        threatScore: 0.1,
        threatCategory: 'none',
        threatReasoning: 'Benign question',
        rewriteModified: false,
        originalPrompt: 'Tell me about yourself',
        rewrittenPrompt: 'Tell me about yourself',
      }),
    );
  });

  // 10b. Handles orchestrator events
  it('accumulates routing decision from orchestrator events', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        {
          type: 'orchestrator:route',
          subagentId: 'conversational',
          subagentName: 'Conversational',
          intent: 'question_professional',
          threatOverride: false,
          threatScore: 0.1,
          allowedTools: ['get_resume'],
          promptSource: 'derived',
          reasoning: 'Professional question routed to conversational agent',
          timestamp: Date.now(),
        },
        {
          type: 'orchestrator:context-filter',
          totalMessages: 5,
          delegatedMessages: 3,
          deliveredMessages: 3,
          usedSummary: false,
          annotations: [],
          timestamp: Date.now(),
        },
        { type: 'text-delta', delta: 'response', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('What do you do?');
    });

    await waitFor(() => {
      expect(result.current.liveRouting).not.toBeNull();
      expect(result.current.liveRouting!.subagentId).toBeDefined();
      expect(result.current.liveRouting!.totalMessages).toBeDefined();
    });

    expect(result.current.liveRouting).toEqual(
      expect.objectContaining({
        subagentId: 'conversational',
        subagentName: 'Conversational',
        threatOverride: false,
        allowedTools: ['get_resume'],
        reasoning: 'Professional question routed to conversational agent',
        totalMessages: 5,
        delegatedMessages: 3,
        deliveredMessages: 3,
        usedSummary: false,
      }),
    );
  });

  // 11. stop() aborts the request
  it('stop() aborts the in-flight request and sets isLoading false', async () => {
    // Create a stream that never closes, so we can abort it
    let streamController: ReadableStreamDefaultController<Uint8Array> | null = null;
    const stream = new ReadableStream({
      start(controller) {
        streamController = controller;
        // Enqueue one text-delta to keep the stream alive
        const chunk = new TextEncoder().encode(
          `data: ${JSON.stringify({ type: 'text-delta', delta: 'partial', timestamp: Date.now() })}\n\n`,
        );
        controller.enqueue(chunk);
      },
    });

    const mockResponse = new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'X-Session-Id': 'test-session-abort',
      },
    });

    fetchSpy.mockResolvedValue(mockResponse);

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hello');
    });

    // Should be loading
    expect(result.current.isLoading).toBe(true);

    // Call stop
    act(() => {
      result.current.stop();
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // No error should be set for aborted requests
    expect(result.current.error).toBeNull();

    // Clean up the stream controller
    try {
      (streamController as ReadableStreamDefaultController<Uint8Array> | null)?.close();
    } catch {
      // stream may already be errored from abort
    }
  });

  // 12. Sets sessionId from X-Session-Id response header
  it('captures sessionId from X-Session-Id response header', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse(
        [
          { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
          { type: 'done' },
        ],
        { 'X-Session-Id': 'header-session-999' },
      ),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.sessionId).toBe('header-session-999');
    });
  });

  // 13. Empty assistant content does not add assistant message
  it('does not add assistant bubble when response is empty', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([{ type: 'done' }]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('attack prompt');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Only user message, no assistant message
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('user');
  });

  // 14. Security events are accumulated
  it('accumulates security events', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'security:input-sanitized', reason: 'Unicode normalized', timestamp: 1000 },
        { type: 'text-delta', delta: 'ok', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('test');
    });

    await waitFor(() => {
      expect(result.current.securityEvents).toHaveLength(1);
    });

    expect(result.current.securityEvents[0]).toEqual({
      type: 'security:input-sanitized',
      reason: 'Unicode normalized',
      timestamp: 1000,
    });
  });

  // 15. Messages history is sent to the API
  it('sends full message history to the API', async () => {
    // First message
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'text-delta', delta: 'First response', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('First message');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Second message — should include first user + assistant in history
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'text-delta', delta: 'Second response', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    act(() => {
      result.current.send('Second message');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Verify the second fetch call includes the full message history
    const secondCallBody = JSON.parse(
      (fetchSpy.mock.calls[1][1] as RequestInit).body as string,
    );
    expect(secondCallBody.messages).toHaveLength(3);
    expect(secondCallBody.messages[0]).toEqual({ role: 'user', content: 'First message' });
    expect(secondCallBody.messages[1]).toEqual({ role: 'assistant', content: 'First response' });
    expect(secondCallBody.messages[2]).toEqual({ role: 'user', content: 'Second message' });
  });

  // 16. submitFeedback sends POST to /api/feedback
  it('submitFeedback sends feedback to /api/feedback', async () => {
    // First send a message to establish a session
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'session:start', sessionId: 'sess-fb-test', timestamp: Date.now() },
        { type: 'text-delta', delta: 'Hello', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    // Mock the feedback POST
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const msgId = result.current.messages[1].id;
    await act(async () => {
      await result.current.submitFeedback(msgId, 'positive');
    });

    // Verify fetch was called with the right payload
    const feedbackCall = fetchSpy.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === '/api/feedback',
    );
    expect(feedbackCall).toBeDefined();
    const feedbackBody = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(feedbackBody).toEqual({
      messageId: msgId,
      sessionId: 'sess-fb-test',
      rating: 'positive',
    });

    // Verify optimistic update: message should have feedback stored
    const ratedMsg = result.current.messages.find(m => m.id === msgId);
    expect(ratedMsg?.feedback).toEqual({ rating: 'positive' });
  });

  // 17. submitFeedback sends category for negative feedback
  it('submitFeedback includes category for negative feedback', async () => {
    fetchSpy.mockResolvedValue(
      createSSEResponse([
        { type: 'session:start', sessionId: 'sess-fb-neg', timestamp: Date.now() },
        { type: 'text-delta', delta: 'Response', timestamp: Date.now() },
        { type: 'done' },
      ]),
    );

    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.send('Hi');
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const msgId = result.current.messages[1].id;
    await act(async () => {
      await result.current.submitFeedback(msgId, 'negative', 'inaccurate');
    });

    const feedbackCall = fetchSpy.mock.calls.find(
      (c: unknown[]) => (c[0] as string) === '/api/feedback',
    );
    const feedbackBody = JSON.parse((feedbackCall![1] as RequestInit).body as string);
    expect(feedbackBody.category).toBe('inaccurate');
  });
});
