import { describe, it, expect } from 'vitest';
import type {
  UserIdentity,
  ChannelLink,
  LinkMethod,
  LinkRequest,
  LinkVerification,
} from '../types';

describe('UserIdentity types', () => {
  it('creates a UserIdentity with all fields', () => {
    const identity: UserIdentity = {
      id: 'uid-001',
      channelLinks: [],
      createdAt: 1700000000000,
      lastSeenAt: 1700000060000,
      adminStatus: false,
    };

    expect(identity.id).toBe('uid-001');
    expect(identity.channelLinks).toEqual([]);
    expect(identity.createdAt).toBe(1700000000000);
    expect(identity.lastSeenAt).toBe(1700000060000);
    expect(identity.adminStatus).toBe(false);
  });

  it('creates a ChannelLink for each LinkMethod variant', () => {
    const methods: LinkMethod[] = ['phone-match', 'explicit-link', 'oauth', 'admin-link'];

    const links: ChannelLink[] = methods.map((method, i) => ({
      channelType: 'sms' as const,
      channelUserId: `user-${i}`,
      linkedAt: 1700000000000 + i,
      linkedBy: method,
      verified: method !== 'explicit-link',
    }));

    expect(links).toHaveLength(4);
    expect(links[0].linkedBy).toBe('phone-match');
    expect(links[1].linkedBy).toBe('explicit-link');
    expect(links[2].linkedBy).toBe('oauth');
    expect(links[3].linkedBy).toBe('admin-link');
  });

  it('creates a LinkRequest', () => {
    const request: LinkRequest = {
      id: 'lr-001',
      initiatingUserId: 'uid-001',
      targetChannelType: 'discord',
      targetChannelUserId: '123456789012345678',
      verificationCode: '482917',
      createdAt: 1700000000000,
      expiresAt: 1700000600000,
      status: 'pending',
    };

    expect(request.id).toBe('lr-001');
    expect(request.targetChannelType).toBe('discord');
    expect(request.verificationCode).toBe('482917');
    expect(request.status).toBe('pending');
  });

  it('creates a LinkVerification with a valid code', () => {
    const verification: LinkVerification = {
      requestId: 'lr-001',
      code: '482917',
      attemptedAt: 1700000300000,
    };

    expect(verification.requestId).toBe('lr-001');
    expect(verification.code).toBe('482917');
    expect(verification.attemptedAt).toBe(1700000300000);
  });

  it('creates a LinkVerification with an expired code scenario', () => {
    const request: LinkRequest = {
      id: 'lr-002',
      initiatingUserId: 'uid-001',
      targetChannelType: 'sms',
      targetChannelUserId: '+15551234567',
      verificationCode: '111222',
      createdAt: 1700000000000,
      expiresAt: 1700000600000,
      status: 'expired',
    };

    const verification: LinkVerification = {
      requestId: 'lr-002',
      code: '111222',
      attemptedAt: 1700001000000,
    };

    expect(request.status).toBe('expired');
    expect(verification.attemptedAt).toBeGreaterThan(request.expiresAt);
  });

  it('creates a UserIdentity with multiple ChannelLinks', () => {
    const identity: UserIdentity = {
      id: 'uid-002',
      channelLinks: [
        {
          channelType: 'web',
          channelUserId: 'session-abc',
          linkedAt: 1700000000000,
          linkedBy: 'explicit-link',
          verified: true,
        },
        {
          channelType: 'sms',
          channelUserId: '+15559876543',
          linkedAt: 1700000100000,
          linkedBy: 'phone-match',
          verified: true,
        },
        {
          channelType: 'discord',
          channelUserId: '987654321098765432',
          linkedAt: 1700000200000,
          linkedBy: 'oauth',
          verified: false,
        },
      ],
      createdAt: 1700000000000,
      lastSeenAt: 1700000200000,
      adminStatus: true,
    };

    expect(identity.channelLinks).toHaveLength(3);
    expect(identity.channelLinks[0].channelType).toBe('web');
    expect(identity.channelLinks[1].channelType).toBe('sms');
    expect(identity.channelLinks[2].channelType).toBe('discord');
    expect(identity.adminStatus).toBe(true);
  });
});
