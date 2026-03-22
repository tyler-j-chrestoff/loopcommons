import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  createTournamentManager,
  resetTournamentManager,
} from '../src/lib/tournament-manager';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockCheckApiKey = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: (...args: unknown[]) => mockCheckApiKey(...args),
}));

const mockManager = createTournamentManager();

vi.mock('@/lib/tournament-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/tournament-manager')>();
  return {
    ...actual,
    getTournamentManager: () => mockManager,
  };
});

vi.mock('@/lib/tournament-runner', () => ({
  runTournamentAsync: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import routes AFTER mocks
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/arena/tournament/route';
import { GET as GETStream } from '@/app/api/arena/tournament/[id]/stream/route';
import { GET as GETState } from '@/app/api/arena/tournament/[id]/state/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePostRequest(body: Record<string, unknown>) {
  return new NextRequest(new URL('http://localhost:3000/api/arena/tournament'), {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/arena/tournament', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManager.reset();
  });

  it('rejects unauthenticated requests', async () => {
    mockCheckApiKey.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    );
    const res = await POST(makePostRequest({}));
    expect(res.status).toBe(403);
  });

  it('returns tournamentId on success', async () => {
    const res = await POST(makePostRequest({
      maxGenerations: 2,
      populationSize: 4,
    }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tournamentId).toBeTruthy();
    expect(typeof data.tournamentId).toBe('string');
  });

  it('rejects when tournament already running', async () => {
    mockManager.start('existing');
    const res = await POST(makePostRequest({ maxGenerations: 2 }));
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toContain('already running');
  });
});

describe('GET /api/arena/tournament/[id]/state', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManager.reset();
  });

  it('rejects unauthenticated requests', async () => {
    mockCheckApiKey.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    );
    const req = makeGetRequest('/api/arena/tournament/t-1/state');
    const res = await GETState(req, { params: Promise.resolve({ id: 't-1' }) });
    expect(res.status).toBe(403);
  });

  it('returns 404 when no tournament matches', async () => {
    const req = makeGetRequest('/api/arena/tournament/nonexistent/state');
    const res = await GETState(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });

  it('returns snapshot for active tournament', async () => {
    mockManager.start('t-1');
    const req = makeGetRequest('/api/arena/tournament/t-1/state');
    const res = await GETState(req, { params: Promise.resolve({ id: 't-1' }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.tournamentId).toBe('t-1');
    expect(data.status).toBe('running');
  });
});

describe('GET /api/arena/tournament/[id]/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockManager.reset();
  });

  it('rejects unauthenticated requests', async () => {
    mockCheckApiKey.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
    );
    const req = makeGetRequest('/api/arena/tournament/t-1/stream');
    const res = await GETStream(req, { params: Promise.resolve({ id: 't-1' }) });
    expect(res.status).toBe(403);
  });

  it('returns SSE headers', async () => {
    mockManager.start('t-1');
    const req = makeGetRequest('/api/arena/tournament/t-1/stream');
    const res = await GETStream(req, { params: Promise.resolve({ id: 't-1' }) });
    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');
    expect(res.headers.get('Connection')).toBe('keep-alive');
  });

  it('returns 404 when no tournament matches', async () => {
    const req = makeGetRequest('/api/arena/tournament/nonexistent/stream');
    const res = await GETStream(req, { params: Promise.resolve({ id: 'nonexistent' }) });
    expect(res.status).toBe(404);
  });
});
