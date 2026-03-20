import { describe, it, expect, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

describe('GET /api/health', () => {
  it('returns commit sha from env', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_COMMIT', 'abc1234');
    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.commit).toBe('abc1234');
    expect(body.status).toBe('ok');
    expect(body).toHaveProperty('timestamp');
    vi.unstubAllEnvs();
  });

  it('returns "unknown" when env is not set', async () => {
    vi.stubEnv('NEXT_PUBLIC_BUILD_COMMIT', '');
    const res = await GET();
    const body = await res.json();

    expect(body.commit).toBe('unknown');
    vi.unstubAllEnvs();
  });
});
