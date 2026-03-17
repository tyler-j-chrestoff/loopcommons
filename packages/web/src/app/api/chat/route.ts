import { agent } from '@loopcommons/llm';
import type { TraceEvent, TraceCollector, Round, Trace } from '@loopcommons/llm';
import { tools } from '@/tools';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_MESSAGES = 50;

/** Deep-clone a Round and strip rawResponse (contains Anthropic API headers). */
function stripRound(round: Round): Round {
  const { rawResponse, ...safeResponse } = round.response;
  return { ...round, response: safeResponse as Round['response'] };
}

/** Strip rawResponse from all rounds in a trace. */
function stripTrace(trace: Trace): Trace {
  return { ...trace, rounds: trace.rounds.map(stripRound) };
}

/** Sanitize a trace event before sending over SSE. */
function sanitizeEvent(event: TraceEvent): TraceEvent {
  if (event.type === 'round:complete') {
    return { ...event, round: stripRound(event.round) };
  }
  if (event.type === 'trace:complete') {
    return { ...event, trace: stripTrace(event.trace) };
  }
  return event;
}

const SYSTEM_PROMPT = `You are the conversational agent on Loop Commons, Tyler's personal website.

You have tools available — use them when relevant:
- **get_resume**: Retrieve Tyler's professional background (experience, skills, education). Use when asked about Tyler's qualifications, work history, or skills.
- **get_project**: Retrieve details about how Loop Commons is built (architecture, trace system, tech stack, agent loop). Use when asked about the site's technology or design.

Be concise, friendly, and informative. When you use a tool, synthesize the data into a natural response rather than dumping raw output.`;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('messages' in body)) {
    return Response.json({ error: 'Missing messages field' }, { status: 400 });
  }

  const { messages } = body as { messages: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return Response.json({ error: `messages must be an array of 1-${MAX_MESSAGES} items` }, { status: 400 });
  }

  // Validate each message
  for (const msg of messages) {
    if (!msg || typeof msg !== 'object') {
      return Response.json({ error: 'Each message must be an object' }, { status: 400 });
    }
    const { role, content } = msg as { role: unknown; content: unknown };
    if (role !== 'user' && role !== 'assistant') {
      return Response.json({ error: 'Message role must be "user" or "assistant"' }, { status: 400 });
    }
    if (typeof content !== 'string' || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      return Response.json({ error: `Message content must be a string of 1-${MAX_MESSAGE_LENGTH} chars` }, { status: 400 });
    }
  }

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  function sendEvent(data: unknown): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {});
  }

  const collector: TraceCollector = {
    onEvent(event: TraceEvent) {
      sendEvent(sanitizeEvent(event));
    },
  };

  // Run agent in background, stream events as SSE
  (async () => {
    try {
      await agent({
        model: 'claude-haiku-4-5',
        system: SYSTEM_PROMPT,
        messages: messages.map((m: { role: string; content: string }) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
        tools,
        maxRounds: 5,
        stream: true,
        trace: collector,
      });
    } catch (err) {
      sendEvent({ type: 'error', error: err instanceof Error ? err.message : 'Unknown error', timestamp: Date.now() });
    } finally {
      sendEvent({ type: 'done' });
      writer.close().catch(() => {});
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
