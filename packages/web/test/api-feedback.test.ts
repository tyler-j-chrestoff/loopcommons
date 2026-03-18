import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these exist before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockAuth, mockAppendFile, mockReaddir, mockAccess } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockAppendFile: vi.fn(),
  mockReaddir: vi.fn(),
  mockAccess: vi.fn(),
}));

vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

vi.mock('node:fs', () => ({
  promises: {
    appendFile: mockAppendFile,
    readdir: mockReaddir,
    access: mockAccess,
  },
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are registered
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/feedback/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): Request {
  return new Request('http://localhost:3000/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

// ---------------------------------------------------------------------------
// Tests: POST /api/feedback
// ---------------------------------------------------------------------------

describe('POST /api/feedback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: authenticated
    mockAuth.mockResolvedValue({ user: { name: 'admin' } });
    // Default: session file exists
    mockReaddir.mockResolvedValue(['2026-03-18']);
    mockAccess.mockResolvedValue(undefined);
    mockAppendFile.mockResolvedValue(undefined);
  });

  it('returns 401 when not authenticated', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(makeRequest({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'positive',
    }));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 on missing required fields', async () => {
    const res = await POST(makeRequest({}));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('returns 400 on invalid rating value', async () => {
    const res = await POST(makeRequest({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'invalid',
    }));

    expect(res.status).toBe(400);
  });

  it('returns 400 on empty messageId', async () => {
    const res = await POST(makeRequest({
      messageId: '',
      sessionId: 'sess-1',
      rating: 'positive',
    }));

    expect(res.status).toBe(400);
  });

  it('returns 200 and writes feedback event on valid positive feedback', async () => {
    const res = await POST(makeRequest({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'positive',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.type).toBe('eval:feedback');
    expect(body.event.messageId).toBe('msg-1');
    expect(body.event.sessionId).toBe('sess-1');
    expect(body.event.rating).toBe('positive');
    expect(body.event.timestamp).toBeTypeOf('number');
    expect(body.event.category).toBeUndefined();

    // Verify appendFile was called with the event as JSONL
    expect(mockAppendFile).toHaveBeenCalledOnce();
    const [filePath, content] = mockAppendFile.mock.calls[0];
    expect(filePath).toContain('sess-1.jsonl');
    const written = JSON.parse(content.trim());
    expect(written.type).toBe('eval:feedback');
    expect(written.rating).toBe('positive');
  });

  it('returns 200 and includes category for negative feedback', async () => {
    const res = await POST(makeRequest({
      messageId: 'msg-2',
      sessionId: 'sess-2',
      rating: 'negative',
      category: 'inaccurate',
    }));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.rating).toBe('negative');
    expect(body.event.category).toBe('inaccurate');
  });

  it('returns 404 when session file is not found', async () => {
    mockReaddir.mockResolvedValue(['2026-03-18']);
    mockAccess.mockRejectedValue(new Error('ENOENT'));

    const res = await POST(makeRequest({
      messageId: 'msg-1',
      sessionId: 'nonexistent',
      rating: 'positive',
    }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain('Session');
  });

  it('returns 400 on invalid category value', async () => {
    const res = await POST(makeRequest({
      messageId: 'msg-1',
      sessionId: 'sess-1',
      rating: 'negative',
      category: 'wrong_category',
    }));

    expect(res.status).toBe(400);
  });
});
