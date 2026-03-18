import { NextRequest, NextResponse } from 'next/server';

const API_KEY = process.env.API_SECRET_KEY;

/**
 * Check request authorization for protected API endpoints.
 * Allows access if any of these are true:
 *   1. API_SECRET_KEY is not set (local dev)
 *   2. Valid X-API-Key header matches API_SECRET_KEY
 *   3. Request is same-origin (browser Sec-Fetch-Site header)
 * Returns a 403 NextResponse if auth fails, or null if auth passes.
 */
export function checkApiKey(request: NextRequest): NextResponse | null {
  if (!API_KEY) return null; // no key configured — allow all (local dev)

  // Allow requests with valid API key
  const provided = request.headers.get('x-api-key');
  if (provided === API_KEY) return null;

  // Allow same-origin browser requests (Sec-Fetch-Site is set by browsers, not forgeable by curl)
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite === 'same-origin') return null;

  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}
