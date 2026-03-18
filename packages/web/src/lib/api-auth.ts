import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SECRET_KEY;

/**
 * Check X-API-Key header against API_SECRET_KEY env var.
 * Returns a 403 NextResponse if auth fails, or null if auth passes.
 * When API_SECRET_KEY is not set, all requests are allowed (dev mode).
 */
export function checkApiKey(request: NextRequest): NextResponse | null {
  if (!API_KEY) return null; // no key configured — allow all (local dev)

  const provided = request.headers.get('x-api-key');
  if (provided !== API_KEY) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return null;
}
