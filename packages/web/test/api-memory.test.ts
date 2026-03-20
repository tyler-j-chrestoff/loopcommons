import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockRecall, mockStats } = vi.hoisted(() => ({
  mockRecall: vi.fn().mockResolvedValue([]),
  mockStats: vi.fn().mockResolvedValue({
    totalEntries: 0,
    byType: { observation: 0, learning: 0, relationship: 0, reflection: 0 },
  }),
}));

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('@loopcommons/memory', () => ({
  createJsonFilePersistentState: vi.fn(() => ({
    recall: mockRecall,
    remember: vi.fn(),
    stats: mockStats,
  })),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks
// ---------------------------------------------------------------------------

import { GET } from '@/app/api/memory/route';
import { checkApiKey } from '@/lib/api-auth';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url = '/api/memory'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

function makeMemory(overrides: Record<string, unknown> = {}) {
  return {
    type: 'observation',
    id: 'mem-1',
    subject: 'user',
    content: 'likes hiking',
    provenance: { agent: 'test', timestamp: '2026-01-01T00:00:00Z', used: [] },
    modality: 'observation',
    uncertainty: 0.5,
    visibility: 'local',
    tags: ['outdoor'],
    updatedAt: '2026-01-01T00:00:00Z',
    accessCount: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/memory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when auth fails', async () => {
    vi.mocked(checkApiKey).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }) as any,
    );
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  it('returns empty entries when no memories exist', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({
      totalEntries: 0,
      byType: { observation: 0, learning: 0, relationship: 0, reflection: 0 },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toEqual([]);
    expect(data.stats.totalEntries).toBe(0);
  });

  it('returns memories with stats', async () => {
    const mem = makeMemory();
    mockRecall.mockResolvedValueOnce([mem]);
    mockStats.mockResolvedValueOnce({
      totalEntries: 1,
      byType: { observation: 1, learning: 0, relationship: 0, reflection: 0 },
    });

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].id).toBe('mem-1');
    expect(data.stats.totalEntries).toBe(1);
  });

  it('filters by type query param', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({ totalEntries: 0, byType: {} });

    await GET(makeRequest('/api/memory?type=learning'));
    expect(mockRecall).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'learning' }),
    );
  });

  it('filters by tags query param (comma-separated)', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({ totalEntries: 0, byType: {} });

    await GET(makeRequest('/api/memory?tags=outdoor,hiking'));
    expect(mockRecall).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ['outdoor', 'hiking'] }),
    );
  });

  it('respects limit query param', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({ totalEntries: 0, byType: {} });

    await GET(makeRequest('/api/memory?limit=5'));
    expect(mockRecall).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5 }),
    );
  });

  it('includes superseded entries when requested', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({ totalEntries: 0, byType: {} });

    await GET(makeRequest('/api/memory?includeSuperseded=true'));
    expect(mockRecall).toHaveBeenCalledWith(
      expect.objectContaining({ includeSuperseded: true }),
    );
  });

  it('strips vector field from response to save bandwidth', async () => {
    const mem = makeMemory({ vector: [0.1, 0.2, 0.3] });
    mockRecall.mockResolvedValueOnce([mem]);
    mockStats.mockResolvedValueOnce({ totalEntries: 1, byType: {} });

    const res = await GET(makeRequest());
    const data = await res.json();
    expect(data.entries[0].vector).toBeUndefined();
  });

  it('defaults limit to 50', async () => {
    mockRecall.mockResolvedValueOnce([]);
    mockStats.mockResolvedValueOnce({ totalEntries: 0, byType: {} });

    await GET(makeRequest());
    expect(mockRecall).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 50 }),
    );
  });
});
