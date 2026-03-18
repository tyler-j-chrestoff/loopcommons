import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  acquireConnection,
  releaseConnection,
  getClientIp,
  getRateLimitStatus,
  _resetForTesting,
  RATE_LIMIT_RPM,
  RATE_LIMIT_CONCURRENT,
} from '../src/lib/rate-limit';

beforeEach(() => {
  _resetForTesting();
});

describe('checkRateLimit', () => {
  it('allows requests under the limit', () => {
    const result = checkRateLimit('1.2.3.4');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(RATE_LIMIT_RPM - 1);
  });

  it('blocks after exceeding RPM limit', () => {
    for (let i = 0; i < RATE_LIMIT_RPM; i++) {
      checkRateLimit('1.2.3.4');
    }
    const blocked = checkRateLimit('1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it('tracks IPs independently', () => {
    for (let i = 0; i < RATE_LIMIT_RPM; i++) {
      checkRateLimit('1.1.1.1');
    }
    // Different IP should still be allowed
    const result = checkRateLimit('2.2.2.2');
    expect(result.allowed).toBe(true);
  });
});

describe('connection guard', () => {
  it('allows connections under the concurrent limit', () => {
    expect(acquireConnection('1.2.3.4')).toBe(true);
  });

  it('blocks after exceeding concurrent limit', () => {
    for (let i = 0; i < RATE_LIMIT_CONCURRENT; i++) {
      acquireConnection('1.2.3.4');
    }
    expect(acquireConnection('1.2.3.4')).toBe(false);
  });

  it('allows new connections after release', () => {
    for (let i = 0; i < RATE_LIMIT_CONCURRENT; i++) {
      acquireConnection('1.2.3.4');
    }
    releaseConnection('1.2.3.4');
    expect(acquireConnection('1.2.3.4')).toBe(true);
  });

  it('release below zero is safe', () => {
    releaseConnection('1.2.3.4');
    // Should not throw or go negative
    const status = getRateLimitStatus('1.2.3.4');
    expect(status.activeConnections).toBe(0);
  });
});

describe('getRateLimitStatus', () => {
  it('returns full capacity for fresh IP', () => {
    const status = getRateLimitStatus('fresh-ip');
    expect(status.remaining).toBe(RATE_LIMIT_RPM);
    expect(status.limit).toBe(RATE_LIMIT_RPM);
    expect(status.activeConnections).toBe(0);
    expect(status.concurrencyLimit).toBe(RATE_LIMIT_CONCURRENT);
    expect(status.resetMs).toBe(0);
  });

  it('reflects remaining after requests', () => {
    checkRateLimit('1.2.3.4');
    checkRateLimit('1.2.3.4');
    const status = getRateLimitStatus('1.2.3.4');
    expect(status.remaining).toBe(RATE_LIMIT_RPM - 2);
    expect(status.resetMs).toBeGreaterThan(0);
  });
});

describe('getClientIp', () => {
  it('extracts from x-forwarded-for', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2' },
    });
    expect(getClientIp(req)).toBe('10.0.0.1');
  });

  it('falls back to x-real-ip', () => {
    const req = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.5' },
    });
    expect(getClientIp(req)).toBe('10.0.0.5');
  });

  it('returns unknown when no headers', () => {
    const req = new Request('http://localhost');
    expect(getClientIp(req)).toBe('unknown');
  });
});
