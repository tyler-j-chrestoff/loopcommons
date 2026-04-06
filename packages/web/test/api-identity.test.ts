import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAuth, mockResolve, mockCreateLinkRequest, mockVerifyLink, mockTouch } = vi.hoisted(
  () => ({
    mockAuth: vi.fn(),
    mockResolve: vi.fn(),
    mockCreateLinkRequest: vi.fn(),
    mockVerifyLink: vi.fn(),
    mockTouch: vi.fn(),
  }),
);

vi.mock('@/auth', () => ({
  auth: mockAuth,
}));

vi.mock('@/lib/identity-store', () => ({
  getIdentityStore: () => ({
    resolve: mockResolve,
    createLinkRequest: mockCreateLinkRequest,
    verifyLink: mockVerifyLink,
    touch: mockTouch,
    getById: vi.fn(),
    getByChannelUser: vi.fn(),
    adminLink: vi.fn(),
  }),
}));

describe('Identity link API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/identity/link', () => {
    async function postLink(body: unknown, authed = true) {
      if (authed) {
        mockAuth.mockResolvedValue({ user: { name: 'admin' } });
      } else {
        mockAuth.mockResolvedValue(null);
      }

      const { POST } = await import('@/app/api/identity/link/route');
      return POST(
        new Request('http://localhost/api/identity/link', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    }

    it('requires auth — returns 401 without session', async () => {
      const res = await postLink(
        { targetChannelType: 'sms', targetChannelUserId: '+15551234567' },
        false,
      );
      expect(res.status).toBe(401);
    });

    it('creates link request and returns requestId + expiresAt', async () => {
      mockResolve.mockResolvedValue({ id: 'unified-id-1', adminStatus: false });
      mockCreateLinkRequest.mockResolvedValue({
        id: 'req-123',
        expiresAt: Date.now() + 600_000,
        verificationCode: '123456',
        status: 'pending',
      });

      const res = await postLink({
        targetChannelType: 'sms',
        targetChannelUserId: '+15551234567',
      });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.requestId).toBe('req-123');
      expect(json.expiresAt).toBeDefined();
      // verification code must NOT be returned to the client
      expect(json.verificationCode).toBeUndefined();
    });

    it('validates E.164 phone number format', async () => {
      mockResolve.mockResolvedValue({ id: 'unified-id-1', adminStatus: false });

      const res = await postLink({
        targetChannelType: 'sms',
        targetChannelUserId: '5551234567', // missing +
      });
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toMatch(/E\.164/i);
    });

    it('rejects non-sms channel types for now', async () => {
      mockResolve.mockResolvedValue({ id: 'unified-id-1', adminStatus: false });

      const res = await postLink({
        targetChannelType: 'discord',
        targetChannelUserId: 'user#1234',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/identity/verify', () => {
    async function postVerify(body: unknown, authed = true) {
      if (authed) {
        mockAuth.mockResolvedValue({ user: { name: 'admin' } });
      } else {
        mockAuth.mockResolvedValue(null);
      }

      const { POST } = await import('@/app/api/identity/verify/route');
      return POST(
        new Request('http://localhost/api/identity/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
      );
    }

    it('requires auth — returns 401 without session', async () => {
      const res = await postVerify({ requestId: 'req-123', code: '123456' }, false);
      expect(res.status).toBe(401);
    });

    it('succeeds with correct code', async () => {
      mockVerifyLink.mockResolvedValue({ success: true });

      const res = await postVerify({ requestId: 'req-123', code: '123456' });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('fails with wrong code', async () => {
      mockVerifyLink.mockResolvedValue({
        success: false,
        error: 'Invalid verification code',
      });

      const res = await postVerify({ requestId: 'req-123', code: '000000' });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/invalid/i);
    });

    it('fails with expired request', async () => {
      mockVerifyLink.mockResolvedValue({
        success: false,
        error: 'Request expired',
      });

      const res = await postVerify({ requestId: 'req-expired', code: '123456' });
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/expired/i);
    });
  });
});
