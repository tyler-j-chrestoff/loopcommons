import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const { mockExistsSync, mockReadFileSync, mockWriteFileSync, mockMkdirSync, mockReaddirSync } = vi.hoisted(() => ({
  mockExistsSync: vi.fn(),
  mockReadFileSync: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockMkdirSync: vi.fn(),
  mockReaddirSync: vi.fn(),
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
      writeFileSync: mockWriteFileSync,
      mkdirSync: mockMkdirSync,
      readdirSync: mockReaddirSync,
    },
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    readdirSync: mockReaddirSync,
  };
});

import { GET, POST } from '@/app/api/arena/encounters/route';

const validEncounter = {
  id: 'test-e1',
  name: 'Test Encounter',
  sandbox: {
    files: { 'config.yaml': 'key: value' },
    services: {
      svc: { status: 'running', config: { port: '80' }, metrics: { req: 1 }, logs: ['ok'] },
    },
  },
  prompt: 'Fix it.',
  scoring: [{
    condition: 'hasCommand("fix")',
    score: 1.0,
    resolved: true,
    partial: false,
    details: 'Fixed.',
  }],
};

describe('GET /api/arena/encounters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty list when no encounter files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue([]);
    const req = new NextRequest(new URL('http://localhost:3000/api/arena/encounters'));
    const res = await GET(req);
    const data = await res.json();
    expect(data.encounters).toEqual([]);
  });

  it('lists existing encounter files', async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(['e1.json', 'e2.json']);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify({ id: 'e1', name: 'Encounter 1' }))
      .mockReturnValueOnce(JSON.stringify({ id: 'e2', name: 'Encounter 2' }));

    const req = new NextRequest(new URL('http://localhost:3000/api/arena/encounters'));
    const res = await GET(req);
    const data = await res.json();
    expect(data.encounters).toHaveLength(2);
    expect(data.encounters[0].id).toBe('e1');
  });
});

describe('POST /api/arena/encounters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(true);
  });

  it('creates encounter from valid definition', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/arena/encounters'), {
      method: 'POST',
      body: JSON.stringify(validEncounter),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.id).toBe('test-e1');
    expect(mockWriteFileSync).toHaveBeenCalled();
  });

  it('rejects invalid encounter definition', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/arena/encounters'), {
      method: 'POST',
      body: JSON.stringify({ id: 'bad' }),
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid encounter definition');
  });

  it('rejects invalid JSON', async () => {
    const req = new NextRequest(new URL('http://localhost:3000/api/arena/encounters'), {
      method: 'POST',
      body: 'not json',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
