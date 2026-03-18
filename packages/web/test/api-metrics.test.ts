import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these exist before vi.mock factories run
// ---------------------------------------------------------------------------

const { mockExistsSync, mockReadFileSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
}));

vi.mock('@/lib/api-auth', () => ({
  checkApiKey: vi.fn().mockResolvedValue(null),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: mockExistsSync,
      readFileSync: mockReadFileSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
  };
});

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are registered
// ---------------------------------------------------------------------------

import { GET } from '@/app/api/metrics/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url = '/api/metrics'): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/metrics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns metrics JSON when file exists', async () => {
    const metrics = {
      accuracy: { precision: 0.95, recall: 0.9, f1: 0.92 },
      regime: 'cooperative',
    };
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(metrics));

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accuracy).toEqual({ precision: 0.95, recall: 0.9, f1: 0.92 });
    expect(body.regime).toBe('cooperative');
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=60/);
  });

  it('returns null accuracy and regime when file is missing', async () => {
    mockExistsSync.mockReturnValue(false);

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.accuracy).toBeNull();
    expect(body.regime).toBeNull();
    expect(res.headers.get('Cache-Control')).toMatch(/s-maxage=60/);
  });

  it('returns 500 on read error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation(() => {
      throw new Error('permission denied');
    });

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to load metrics/);
  });

  it('returns 500 on invalid JSON', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json{{{');

    const res = await GET(makeRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/Failed to load metrics/);
  });
});
