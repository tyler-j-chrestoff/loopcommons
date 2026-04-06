import crypto from 'node:crypto';
import type { ChannelType } from '../router/types';
import type { IdentityStore, UserIdentity, ChannelLink, LinkRequest } from './types';

const LINK_EXPIRY_MS = 10 * 60 * 1000;

function defaultLinkMethod(channelType: ChannelType): ChannelLink['linkedBy'] {
  return channelType === 'sms' || channelType === 'whatsapp' ? 'phone-match' : 'oauth';
}

function channelKey(channelType: ChannelType, channelUserId: string): string {
  return `${channelType}:${channelUserId}`;
}

export function createInMemoryIdentityStore(): IdentityStore {
  const identitiesById = new Map<string, UserIdentity>();
  const identityByChannel = new Map<string, string>(); // channelKey -> identity id
  const linkRequests = new Map<string, LinkRequest>();

  function createIdentity(channelType: ChannelType, channelUserId: string): UserIdentity {
    const now = Date.now();
    const identity: UserIdentity = {
      id: crypto.randomUUID(),
      channelLinks: [
        {
          channelType,
          channelUserId,
          linkedAt: now,
          linkedBy: defaultLinkMethod(channelType),
          verified: true,
        },
      ],
      createdAt: now,
      lastSeenAt: now,
      adminStatus: false,
    };
    identitiesById.set(identity.id, identity);
    identityByChannel.set(channelKey(channelType, channelUserId), identity.id);
    return identity;
  }

  function mergeInto(survivorId: string, absorbedId: string): void {
    const survivor = identitiesById.get(survivorId);
    const absorbed = identitiesById.get(absorbedId);
    if (!survivor || !absorbed) return;

    for (const link of absorbed.channelLinks) {
      survivor.channelLinks.push(link);
      identityByChannel.set(channelKey(link.channelType, link.channelUserId), survivorId);
    }

    identitiesById.delete(absorbedId);
  }

  function addChannelLink(
    identity: UserIdentity,
    channelType: ChannelType,
    channelUserId: string,
    method: ChannelLink['linkedBy'],
  ): void {
    const key = channelKey(channelType, channelUserId);
    const existingId = identityByChannel.get(key);

    if (existingId && existingId !== identity.id) {
      mergeInto(identity.id, existingId);
      return;
    }

    if (existingId === identity.id) return;

    identity.channelLinks.push({
      channelType,
      channelUserId,
      linkedAt: Date.now(),
      linkedBy: method,
      verified: true,
    });
    identityByChannel.set(key, identity.id);
  }

  const store: IdentityStore = {
    async resolve(channelType, channelUserId) {
      const key = channelKey(channelType, channelUserId);
      const existingId = identityByChannel.get(key);
      if (existingId) {
        const identity = identitiesById.get(existingId)!;
        identity.lastSeenAt = Date.now();
        return identity;
      }
      return createIdentity(channelType, channelUserId);
    },

    async getById(id) {
      return identitiesById.get(id);
    },

    async getByChannelUser(channelType, channelUserId) {
      const key = channelKey(channelType, channelUserId);
      const id = identityByChannel.get(key);
      if (!id) return undefined;
      return identitiesById.get(id);
    },

    async createLinkRequest(userId, targetChannelType, targetChannelUserId) {
      const identity = identitiesById.get(userId);
      if (!identity) throw new Error(`Identity not found: ${userId}`);

      const now = Date.now();
      const request: LinkRequest = {
        id: crypto.randomUUID(),
        initiatingUserId: userId,
        targetChannelType,
        targetChannelUserId,
        verificationCode: crypto.randomInt(100000, 999999).toString(),
        createdAt: now,
        expiresAt: now + LINK_EXPIRY_MS,
        status: 'pending',
      };
      linkRequests.set(request.id, request);
      return request;
    },

    async verifyLink(requestId, code) {
      const request = linkRequests.get(requestId);
      if (!request) return { success: false, error: 'Request not found' };
      if (request.status !== 'pending') return { success: false, error: 'Request already processed' };
      if (Date.now() > request.expiresAt) {
        request.status = 'expired';
        return { success: false, error: 'Request expired' };
      }
      if (request.verificationCode !== code) {
        return { success: false, error: 'Invalid verification code' };
      }

      const identity = identitiesById.get(request.initiatingUserId);
      if (!identity) return { success: false, error: 'Initiating identity not found' };

      addChannelLink(identity, request.targetChannelType, request.targetChannelUserId, 'explicit-link');
      request.status = 'verified';
      return { success: true };
    },

    async adminLink(userId, channelType, channelUserId) {
      const identity = identitiesById.get(userId);
      if (!identity) throw new Error(`Identity not found: ${userId}`);

      addChannelLink(identity, channelType, channelUserId, 'admin-link');
      return identity;
    },

    async touch(userId) {
      const identity = identitiesById.get(userId);
      if (identity) {
        identity.lastSeenAt = Date.now();
      }
    },
  };

  return store;
}
