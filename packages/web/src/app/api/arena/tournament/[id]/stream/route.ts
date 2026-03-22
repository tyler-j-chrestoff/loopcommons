/**
 * GET /api/arena/tournament/[id]/stream — SSE tournament event stream.
 *
 * Streams TournamentEvents to connected clients in real time.
 * Disconnects automatically when the tournament completes or client aborts.
 */

export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { checkApiKey } from '@/lib/api-auth';
import { getTournamentManager } from '@/lib/tournament-manager';
import type { TournamentEvent } from '@loopcommons/llm/arena/tournament';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  const authError = await checkApiKey(request);
  if (authError) return authError;

  const { id } = await context.params;
  const manager = getTournamentManager();

  if (manager.getTournamentId() !== id) {
    return NextResponse.json(
      { error: 'Tournament not found' },
      { status: 404 },
    );
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  function sendEvent(event: TournamentEvent) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {});
  }

  const unsubscribe = manager.subscribe(sendEvent);

  // Clean up on client disconnect
  request.signal.addEventListener('abort', () => {
    unsubscribe();
    writer.close().catch(() => {});
  });

  // Auto-close on terminal events
  const terminalUnsub = manager.subscribe((event) => {
    if (event.type === 'tournament:complete' || event.type === 'tournament:converged') {
      setTimeout(() => {
        terminalUnsub();
        unsubscribe();
        writer.close().catch(() => {});
      }, 100);
    }
  });

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Tournament-Id': id,
    },
  });
}
