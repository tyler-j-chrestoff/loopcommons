import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these exist before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockList, mockRead } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockRead: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/session/file-session-writer', () => {
  return {
    FileSessionWriter: class {
      list = mockList;
      read = mockRead;
    },
  };
});

vi.mock('@/lib/sanitize-event', () => ({
  sanitizeSessionEvent: vi.fn((event: unknown) => event),
}));

// ---------------------------------------------------------------------------
// Import route handlers AFTER mocks are registered
// ---------------------------------------------------------------------------

import { GET as listSessions } from '@/app/api/sessions/route';
import { GET as getSession } from '@/app/api/sessions/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makeSummary(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    date: '2026-03-18',
    messageCount: 2,
    eventCount: 5,
    durationMs: 1500,
    ...overrides,
  };
}

async function* asyncIterableFrom<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

// ---------------------------------------------------------------------------
// Tests: GET /api/sessions
// ---------------------------------------------------------------------------

describe('GET /api/sessions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns paginated session list', async () => {
    const sessions = [makeSummary('abc-1'), makeSummary('abc-2')];
    mockList.mockResolvedValue({ sessions, nextCursor: 'abc-2' });

    const res = await listSessions(makeRequest('/api/sessions'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessions).toHaveLength(2);
    expect(body.nextCursor).toBe('abc-2');
    expect(mockList).toHaveBeenCalledWith({
      date: undefined,
      limit: 20,
      cursor: undefined,
    });
  });

  it('passes date and limit params to writer.list', async () => {
    mockList.mockResolvedValue({ sessions: [] });

    await listSessions(makeRequest('/api/sessions?date=2026-03-18&limit=5'));

    expect(mockList).toHaveBeenCalledWith({
      date: '2026-03-18',
      limit: 5,
      cursor: undefined,
    });
  });

  it('returns 400 for invalid date format', async () => {
    const res = await listSessions(makeRequest('/api/sessions?date=03-18-2026'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid date format/);
  });

  it('returns 400 for invalid limit', async () => {
    const res = await listSessions(makeRequest('/api/sessions?limit=999'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/limit must be an integer/);
  });

  it('returns 400 for non-integer limit', async () => {
    const res = await listSessions(makeRequest('/api/sessions?limit=abc'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/limit must be an integer/);
  });

  it('returns 400 for invalid cursor format', async () => {
    const res = await listSessions(makeRequest('/api/sessions?cursor=../../etc/passwd'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid cursor format/);
  });

  it('returns thread of linked sessions', async () => {
    const root = makeSummary('root-1');
    const child = makeSummary('child-1', { parentSessionId: 'root-1' });

    // buildThread calls writer.list in a loop until no nextCursor
    mockList.mockResolvedValueOnce({ sessions: [root, child], nextCursor: undefined });

    const res = await listSessions(makeRequest('/api/sessions?thread=child-1'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.thread).toHaveLength(2);
    expect(body.thread[0].id).toBe('root-1');
    expect(body.thread[1].id).toBe('child-1');
  });

  it('returns 400 for invalid thread ID format', async () => {
    const res = await listSessions(makeRequest('/api/sessions?thread=../hack'));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid thread session ID/);
  });

  it('returns 500 when writer.list throws', async () => {
    mockList.mockRejectedValue(new Error('disk full'));

    const res = await listSessions(makeRequest('/api/sessions'));
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to list sessions/);
  });
});

// ---------------------------------------------------------------------------
// Tests: GET /api/sessions/[id]
// ---------------------------------------------------------------------------

describe('GET /api/sessions/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns events for a valid session', async () => {
    const events = [
      { type: 'session:start', sessionId: 'test-id', timestamp: 1 },
      { type: 'session:complete', sessionId: 'test-id', summary: {}, timestamp: 2 },
    ];
    mockRead.mockReturnValue(asyncIterableFrom(events));

    const res = await getSession(
      makeRequest('/api/sessions/test-id'),
      { params: Promise.resolve({ id: 'test-id' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessionId).toBe('test-id');
    expect(body.events).toHaveLength(2);
    expect(body.events[0].type).toBe('session:start');
  });

  it('returns 404 for unknown session', async () => {
    mockRead.mockImplementation(async function* () {
      throw new Error('session file not found for "unknown-id".');
    });

    const res = await getSession(
      makeRequest('/api/sessions/unknown-id'),
      { params: Promise.resolve({ id: 'unknown-id' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/);
  });

  it('returns 400 for invalid session ID with path traversal', async () => {
    const res = await getSession(
      makeRequest('/api/sessions/../../etc'),
      { params: Promise.resolve({ id: '../../etc' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid session ID format/);
  });

  it('returns 400 for session ID exceeding max length', async () => {
    const longId = 'a'.repeat(65);
    const res = await getSession(
      makeRequest(`/api/sessions/${longId}`),
      { params: Promise.resolve({ id: longId }) },
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/Invalid session ID format/);
  });

  it('returns 500 for non-"not found" errors', async () => {
    mockRead.mockImplementation(async function* () {
      throw new Error('disk I/O error');
    });

    const res = await getSession(
      makeRequest('/api/sessions/some-id'),
      { params: Promise.resolve({ id: 'some-id' }) },
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to read session/);
  });
});
