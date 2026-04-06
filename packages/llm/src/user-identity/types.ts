import type { ChannelType } from '../router/types';

export type LinkMethod = 'phone-match' | 'explicit-link' | 'oauth' | 'admin-link';

export type ChannelLink = {
  channelType: ChannelType;
  channelUserId: string;
  linkedAt: number;
  linkedBy: LinkMethod;
  verified: boolean;
};

export type UserIdentity = {
  id: string;
  channelLinks: ChannelLink[];
  createdAt: number;
  lastSeenAt: number;
  adminStatus: boolean;
};

export type LinkRequest = {
  id: string;
  initiatingUserId: string;
  targetChannelType: ChannelType;
  targetChannelUserId: string;
  verificationCode: string;
  createdAt: number;
  expiresAt: number;
  status: 'pending' | 'verified' | 'expired' | 'failed';
};

export type LinkVerification = {
  requestId: string;
  code: string;
  attemptedAt: number;
};

export type IdentityStore = {
  resolve(channelType: ChannelType, channelUserId: string): Promise<UserIdentity>;
  getById(id: string): Promise<UserIdentity | undefined>;
  getByChannelUser(channelType: ChannelType, channelUserId: string): Promise<UserIdentity | undefined>;
  createLinkRequest(userId: string, targetChannelType: ChannelType, targetChannelUserId: string): Promise<LinkRequest>;
  verifyLink(requestId: string, code: string): Promise<{ success: boolean; error?: string }>;
  adminLink(userId: string, channelType: ChannelType, channelUserId: string): Promise<UserIdentity>;
  touch(userId: string): Promise<void>;
};
