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

// Import route handler AFTER mocks
import { GET } from '@/app/api/metrics/calibration/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASELINE = {
  iteration: 0,
  timestamp: '2026-03-18T12:00:00Z',
  proposedEdit: null,
  diff: null,
  metricsBefore: null,
  metricsAfter: { detectionRate: 0.85, fpRate: 0.1, simplicity: 1.0, costEfficiency: 1.0 },
  fitnessScore: 0.82,
  decision: 'baseline',
  commitHash: null,
  validationMetrics: null,
};

const KEPT = {
  iteration: 1,
  timestamp: '2026-03-18T12:01:00Z',
  proposedEdit: 'replace: Simplify rules',
  diff: 'replace: old → new',
  metricsBefore: { detectionRate: 0.85, fpRate: 0.1, simplicity: 1.0, costEfficiency: 1.0 },
  metricsAfter: { detectionRate: 0.9, fpRate: 0.08, simplicity: 0.95, costEfficiency: 1.02 },
  fitnessScore: 0.88,
  decision: 'kept',
  commitHash: 'abc123',
  validationMetrics: null,
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/metrics/calibration');
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/metrics/calibration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty array when log file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([]);
  });

  it('parses JSONL and returns iterations array', async () => {
    const jsonl = [BASELINE, KEPT].map(e => JSON.stringify(e)).join('\n');
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(jsonl);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toHaveLength(2);
    expect(data[0].decision).toBe('baseline');
    expect(data[1].decision).toBe('kept');
  });

  it('strips commitHash and validationMetrics from response', async () => {
    const jsonl = JSON.stringify(KEPT);
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(jsonl);

    const response = await GET(makeRequest());
    const data = await response.json();

    expect(data[0]).not.toHaveProperty('commitHash');
    expect(data[0]).not.toHaveProperty('validationMetrics');
  });

  it('returns 403 when auth fails', async () => {
    const { checkApiKey } = await import('@/lib/api-auth');
    const { NextResponse } = await import('next/server');
    vi.mocked(checkApiKey).mockResolvedValueOnce(
      NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    );

    const response = await GET(makeRequest());
    expect(response.status).toBe(403);
  });

  it('returns 500 on parse error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('not valid json');

    const response = await GET(makeRequest());
    expect(response.status).toBe(500);
  });

  it('sets cache headers', async () => {
    mockExistsSync.mockReturnValue(false);

    const response = await GET(makeRequest());
    expect(response.headers.get('Cache-Control')).toContain('s-maxage=60');
  });
});
