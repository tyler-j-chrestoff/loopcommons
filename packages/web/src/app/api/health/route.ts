import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    commit: process.env.NEXT_PUBLIC_BUILD_COMMIT || 'unknown',
    timestamp: new Date().toISOString(),
  });
}
