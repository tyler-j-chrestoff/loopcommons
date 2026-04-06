import { auth } from '@/auth';
import { getIdentityStore } from '@/lib/identity-store';

export const runtime = 'nodejs';

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

  const { requestId, code } = body as { requestId?: string; code?: string };

  if (!requestId || !code) {
    return Response.json({ error: 'Missing requestId or code' }, { status: 400 });
  }

  const store = getIdentityStore();
  const result = await store.verifyLink(requestId, code);

  return Response.json(result);
}
