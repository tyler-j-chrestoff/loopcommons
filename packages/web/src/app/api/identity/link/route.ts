import { auth } from '@/auth';
import { getIdentityStore } from '@/lib/identity-store';

export const runtime = 'nodejs';

const E164_REGEX = /^\+[1-9]\d{9,14}$/;

export async function POST(request: Request): Promise<Response> {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return Response.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { targetChannelType, targetChannelUserId } = body as {
    targetChannelType?: string;
    targetChannelUserId?: string;
  };

  if (!targetChannelType || !targetChannelUserId) {
    return Response.json(
      { error: 'Missing targetChannelType or targetChannelUserId' },
      { status: 400 },
    );
  }

  if (targetChannelType !== 'sms') {
    return Response.json(
      { error: 'Only SMS linking is supported at this time' },
      { status: 400 },
    );
  }

  if (!E164_REGEX.test(targetChannelUserId)) {
    return Response.json(
      { error: 'Phone number must be in E.164 format (e.g. +15551234567)' },
      { status: 400 },
    );
  }

  const store = getIdentityStore();
  const webIdentity = await store.resolve('web', session.user?.name ?? 'anonymous');

  const linkRequest = await store.createLinkRequest(
    webIdentity.id,
    targetChannelType,
    targetChannelUserId,
  );

  return Response.json({
    requestId: linkRequest.id,
    expiresAt: linkRequest.expiresAt,
  });
}
