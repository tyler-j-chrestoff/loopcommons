import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ChannelAdapter, ChannelCapabilities, ChannelMessage, ChannelResponse } from '../types';

export type SmsAdapterConfig = {
  channelId?: string;
};

const SMS_CAPABILITIES: ChannelCapabilities = {
  maxResponseLength: 1600,
  supportsStreaming: false,
  supportsAttachments: true,
  supportsThreads: true,
  supportsReactions: false,
  supportsFormatting: 'plaintext',
};

type TwilioWebhookPayload = {
  MessageSid?: string;
  From?: string;
  To?: string;
  Body?: string;
  AccountSid?: string;
  NumMedia?: string;
  [key: string]: string | undefined;
};

function mimeTypeToAttachmentType(mimeType: string): 'image' | 'audio' | 'video' | 'file' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function createSmsAdapter(config: SmsAdapterConfig = {}): ChannelAdapter {
  const channelId = config.channelId ?? 'sms-twilio';

  return {
    type: 'sms',
    capabilities: SMS_CAPABILITIES,

    normalize(raw: unknown): ChannelMessage {
      const input = (raw != null && typeof raw === 'object' ? raw : {}) as TwilioWebhookPayload;

      const messageSid = input.MessageSid ?? crypto.randomUUID();
      const from = input.From ?? 'unknown';
      const body = typeof input.Body === 'string' ? input.Body : '';
      const numMedia = parseInt(input.NumMedia ?? '0', 10) || 0;

      const attachments =
        numMedia > 0
          ? Array.from({ length: numMedia }, (_, i) => {
              const url = input[`MediaUrl${i}`] ?? '';
              const mimeType = input[`MediaContentType${i}`] ?? '';
              return {
                type: mimeTypeToAttachmentType(mimeType),
                url,
                mimeType,
              } as const;
            })
          : undefined;

      return {
        id: messageSid,
        channel: { type: 'sms', id: channelId, capabilities: SMS_CAPABILITIES },
        user: {
          id: from,
          isAdmin: false,
          isAuthenticated: false,
        },
        thread: { id: from },
        content: {
          text: body,
          ...(attachments ? { attachments } : {}),
        },
        timestamp: Date.now(),
      };
    },

    format(response: ChannelResponse): unknown {
      const text = response.content.text;
      if (!text) {
        return { twiml: '<Response/>' };
      }

      const maxLen = SMS_CAPABILITIES.maxResponseLength!;
      const truncated = text.length > maxLen ? text.slice(0, maxLen) : text;
      const escaped = escapeXml(truncated);

      return { twiml: `<Response><Message>${escaped}</Message></Response>` };
    },
  };
}

export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): boolean {
  const sortedKeys = Object.keys(params).sort();
  let data = url;
  for (const key of sortedKeys) {
    data += key + params[key];
  }

  const expected = createHmac('sha1', authToken).update(data).digest('base64');

  try {
    const sigBuf = Buffer.from(signature, 'base64');
    const expectedBuf = Buffer.from(expected, 'base64');
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  } catch {
    return false;
  }
}
