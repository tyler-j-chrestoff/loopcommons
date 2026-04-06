import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createInMemoryIdentityStore } from '../in-memory-store';
import type { IdentityStore } from '../types';

describe('InMemoryIdentityStore', () => {
  let store: IdentityStore;

  beforeEach(() => {
    store = createInMemoryIdentityStore();
  });

  describe('resolve()', () => {
    it('creates new identity on first contact via SMS', async () => {
      const identity = await store.resolve('sms', '+15551234567');
      expect(identity.id).toBeTruthy();
      expect(identity.channelLinks).toHaveLength(1);
      expect(identity.channelLinks[0]).toMatchObject({
        channelType: 'sms',
        channelUserId: '+15551234567',
        verified: true,
        linkedBy: 'phone-match',
      });
      expect(identity.adminStatus).toBe(false);
    });

    it('creates new identity on first contact via web', async () => {
      const identity = await store.resolve('web', 'session-abc');
      expect(identity.channelLinks[0]).toMatchObject({
        channelType: 'web',
        channelUserId: 'session-abc',
        verified: true,
        linkedBy: 'oauth',
      });
    });

    it('returns same identity on second contact with same channel user', async () => {
      const first = await store.resolve('sms', '+15551234567');
      const second = await store.resolve('sms', '+15551234567');
      expect(second.id).toBe(first.id);
    });

    it('updates lastSeenAt on resolve', async () => {
      const first = await store.resolve('sms', '+15551234567');
      const firstSeen = first.lastSeenAt;

      // Advance time slightly
      vi.useFakeTimers();
      vi.setSystemTime(Date.now() + 1000);

      const second = await store.resolve('sms', '+15551234567');
      expect(second.lastSeenAt).toBeGreaterThan(firstSeen);

      vi.useRealTimers();
    });

    it('different channel users get different identities', async () => {
      const a = await store.resolve('sms', '+15551111111');
      const b = await store.resolve('sms', '+15552222222');
      expect(a.id).not.toBe(b.id);
    });
  });

  describe('getById() / getByChannelUser()', () => {
    it('returns undefined for unknown ID', async () => {
      expect(await store.getById('nonexistent')).toBeUndefined();
    });

    it('returns identity after resolve', async () => {
      const resolved = await store.resolve('sms', '+15551234567');
      const found = await store.getById(resolved.id);
      expect(found).toBeDefined();
      expect(found!.id).toBe(resolved.id);
    });

    it('getByChannelUser returns correct identity', async () => {
      const resolved = await store.resolve('web', 'user-x');
      const found = await store.getByChannelUser('web', 'user-x');
      expect(found).toBeDefined();
      expect(found!.id).toBe(resolved.id);
    });

    it('getByChannelUser returns undefined for unknown channel user', async () => {
      expect(await store.getByChannelUser('sms', 'unknown')).toBeUndefined();
    });
  });

  describe('createLinkRequest()', () => {
    it('creates request with 6-digit code', async () => {
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');
      expect(req.verificationCode).toMatch(/^\d{6}$/);
      expect(req.initiatingUserId).toBe(identity.id);
      expect(req.targetChannelType).toBe('sms');
      expect(req.targetChannelUserId).toBe('+15559999999');
    });

    it('request has pending status and future expiry', async () => {
      const identity = await store.resolve('web', 'user-1');
      const now = Date.now();
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');
      expect(req.status).toBe('pending');
      expect(req.expiresAt).toBeGreaterThan(now);
      // 10-minute expiry
      expect(req.expiresAt - req.createdAt).toBe(10 * 60 * 1000);
    });

    it('fails for non-existent userId', async () => {
      await expect(
        store.createLinkRequest('nonexistent', 'sms', '+15559999999'),
      ).rejects.toThrow();
    });
  });

  describe('verifyLink()', () => {
    it('successful verification links channel to identity', async () => {
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');

      const result = await store.verifyLink(req.id, req.verificationCode);
      expect(result.success).toBe(true);

      const updated = await store.getById(identity.id);
      expect(updated!.channelLinks).toHaveLength(2);
      const smsLink = updated!.channelLinks.find(l => l.channelType === 'sms');
      expect(smsLink).toMatchObject({
        channelType: 'sms',
        channelUserId: '+15559999999',
        verified: true,
        linkedBy: 'explicit-link',
      });
    });

    it('after linking, both channel users resolve to same identity', async () => {
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');
      await store.verifyLink(req.id, req.verificationCode);

      const fromWeb = await store.resolve('web', 'user-1');
      const fromSms = await store.resolve('sms', '+15559999999');
      expect(fromWeb.id).toBe(fromSms.id);
    });

    it('wrong code fails', async () => {
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');

      const result = await store.verifyLink(req.id, '000000');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('expired request fails', async () => {
      vi.useFakeTimers();
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');

      // Advance past expiry
      vi.setSystemTime(req.expiresAt + 1);

      const result = await store.verifyLink(req.id, req.verificationCode);
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/expire/i);

      vi.useRealTimers();
    });

    it('already-verified request fails', async () => {
      const identity = await store.resolve('web', 'user-1');
      const req = await store.createLinkRequest(identity.id, 'sms', '+15559999999');

      await store.verifyLink(req.id, req.verificationCode);
      const result = await store.verifyLink(req.id, req.verificationCode);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('non-existent request fails', async () => {
      const result = await store.verifyLink('nonexistent', '123456');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('adminLink()', () => {
    it('links new channel to existing identity', async () => {
      const identity = await store.resolve('web', 'user-1');
      const updated = await store.adminLink(identity.id, 'sms', '+15559999999');

      expect(updated.channelLinks).toHaveLength(2);
      const smsLink = updated.channelLinks.find(l => l.channelType === 'sms');
      expect(smsLink).toMatchObject({
        channelType: 'sms',
        channelUserId: '+15559999999',
        linkedBy: 'admin-link',
        verified: true,
      });
    });

    it('merges identities when target already has one', async () => {
      const webUser = await store.resolve('web', 'user-1');
      const smsUser = await store.resolve('sms', '+15559999999');
      expect(webUser.id).not.toBe(smsUser.id);

      const merged = await store.adminLink(webUser.id, 'sms', '+15559999999');
      expect(merged.id).toBe(webUser.id);
      expect(merged.channelLinks).toHaveLength(2);

      // Old sms identity should be gone
      expect(await store.getById(smsUser.id)).toBeUndefined();
    });

    it('after merge, both channel users resolve to surviving identity', async () => {
      const webUser = await store.resolve('web', 'user-1');
      await store.resolve('sms', '+15559999999');

      await store.adminLink(webUser.id, 'sms', '+15559999999');

      const fromWeb = await store.resolve('web', 'user-1');
      const fromSms = await store.resolve('sms', '+15559999999');
      expect(fromWeb.id).toBe(webUser.id);
      expect(fromSms.id).toBe(webUser.id);
    });

    it('fails for non-existent userId', async () => {
      await expect(
        store.adminLink('nonexistent', 'sms', '+15559999999'),
      ).rejects.toThrow();
    });
  });

  describe('edge cases', () => {
    it("can't link same channel user to two different identities (merge happens)", async () => {
      const a = await store.resolve('web', 'user-a');
      const b = await store.resolve('web', 'user-b');

      // admin-link user-b's web identity to user-a
      await store.adminLink(a.id, 'web', 'user-b');

      const resolvedA = await store.resolve('web', 'user-a');
      const resolvedB = await store.resolve('web', 'user-b');
      expect(resolvedA.id).toBe(resolvedB.id);
      expect(resolvedA.id).toBe(a.id);
    });

    it('linking SMS number that already belongs to another identity merges via verifyLink', async () => {
      const webUser = await store.resolve('web', 'user-1');
      const smsUser = await store.resolve('sms', '+15551111111');

      const req = await store.createLinkRequest(webUser.id, 'sms', '+15551111111');
      const result = await store.verifyLink(req.id, req.verificationCode);
      expect(result.success).toBe(true);

      // SMS user identity should be merged into web user
      const resolved = await store.resolve('sms', '+15551111111');
      expect(resolved.id).toBe(webUser.id);
      expect(await store.getById(smsUser.id)).toBeUndefined();
    });
  });

  describe('touch()', () => {
    it('updates lastSeenAt', async () => {
      vi.useFakeTimers();
      const identity = await store.resolve('web', 'user-1');
      const original = identity.lastSeenAt;

      vi.setSystemTime(Date.now() + 5000);
      await store.touch(identity.id);

      const updated = await store.getById(identity.id);
      expect(updated!.lastSeenAt).toBeGreaterThan(original);

      vi.useRealTimers();
    });
  });
});
