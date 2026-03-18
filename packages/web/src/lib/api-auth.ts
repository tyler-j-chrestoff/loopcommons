import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

const API_KEY = process.env.API_SECRET_KEY;

/**
 * Check request authorization for protected API endpoints.
 * Allows access if any of these are true:
 *   1. No auth configured (no API_SECRET_KEY, no ADMIN_USERNAME — local dev)
 *   2. Valid next-auth session (logged-in user)
 *   3. Valid X-API-Key header matches API_SECRET_KEY
 * Returns a 403 NextResponse if auth fails, or null if auth passes.
 */
export async function checkApiKey(request: NextRequest): Promise<NextResponse | null> {
  // No auth configured — allow all (local dev)
  if (!API_KEY && !process.env.ADMIN_USERNAME) return null;

  // Allow requests with valid API key
  if (API_KEY) {
    const provided = request.headers.get('x-api-key');
    if (provided === API_KEY) return null;
  }

  // Allow authenticated sessions (logged-in users)
  const session = await auth();
  if (session) return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
