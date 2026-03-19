import {
  createAmygdala,
  createOrchestrator,
  createToolRegistry,
  createJudge,
  hashForPrivacy,
  LLMError,
} from '@loopcommons/llm';
import type { TraceEvent, TraceCollector, RequestMetadata } from '@loopcommons/llm';
import { createKeywordMemoryPackage } from '@loopcommons/memory/keyword';
import { tools } from '@/tools';
import { createBlogTools } from '@/tools/blog';
import { checkRateLimit, acquireConnection, releaseConnection, getClientIp, getRateLimitStatus } from '@/lib/rate-limit';
import { sanitizeInput, containsRoleSpoofing } from '@/lib/sanitize';
import { canSpend, recordSpend, getSpendStatus } from '@/lib/spend-tracker';
import { sanitizeEvent } from '@/lib/sanitize-event';
import { FileSessionWriter } from '@/lib/session/file-session-writer';
import { TokenBudgetAccumulator } from '@/lib/token-budget';
import { auth } from '@/auth';
import type { SessionEvent } from '@/lib/session-writer';

export const runtime = 'nodejs';

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_MESSAGES = 50;

// ---------------------------------------------------------------------------
// Module-level singletons (reused across requests)
// ---------------------------------------------------------------------------

const amygdala = createAmygdala();
const orchestrator = createOrchestrator();
const blogDataDir = process.env.BLOG_DATA_DIR ?? 'data/blog';
const blogTools = createBlogTools({ dataDir: blogDataDir });
const memoryDataDir = process.env.MEMORY_DATA_DIR ?? 'data/memory';

// Mutable per-request threat score. The closure is read at tool execution time
// (during subagent invocation), not at construction time.
let currentRequestThreatScore = 0;
const memoryPackage = createKeywordMemoryPackage({
  filePath: `${memoryDataDir}/world-model.json`,
  getThreatScore: () => currentRequestThreatScore,
});
const toolRegistry = createToolRegistry([...tools, ...blogTools, ...memoryPackage.tools]);
const sessionWriter = new FileSessionWriter();
const judge = process.env.ENABLE_LLM_JUDGE === 'true' ? createJudge() : null;

/** Generate a short unique session ID (URL-safe, collision-resistant). */
function generateSessionId(): string {
  // 21-char nanoid equivalent using crypto.randomUUID
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

// Note: The old monolithic SYSTEM_PROMPT has been replaced by the amygdala +
// orchestrator pipeline. The amygdala has its own substrate-aware system prompt.
// The orchestrator builds per-subagent system prompts from the registry configs.

export async function POST(request: Request): Promise<Response> {
  // --- Auth check ---
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // --- Rate limiting & concurrency guard ---
  const ip = getClientIp(request);

  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return Response.json(
      { error: 'Too many requests. Please slow down and try again shortly.' },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateCheck.retryAfter),
          'X-RateLimit-Remaining': '0',
        },
      },
    );
  }

  if (!acquireConnection(ip)) {
    return Response.json(
      { error: 'Too many active conversations. Please wait for your current request to finish.' },
      {
        status: 429,
        headers: { 'Retry-After': '5' },
      },
    );
  }

  // --- Daily spend cap ---
  if (!canSpend()) {
    releaseConnection(ip);
    const spend = getSpendStatus();
    return Response.json(
      { error: `The daily API budget has been reached. Please come back after ${spend.resetAtUtc}.` },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    releaseConnection(ip);
    return Response.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!body || typeof body !== 'object' || !('messages' in body)) {
    releaseConnection(ip);
    return Response.json({ error: 'Missing messages field' }, { status: 400 });
  }

  const { messages } = body as { messages: unknown };
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    releaseConnection(ip);
    return Response.json({ error: `messages must be an array of 1-${MAX_MESSAGES} items` }, { status: 400 });
  }

  // Validate, sanitize, and prepare each message
  const securityEvents: Array<{ type: string; reason: string; stripped?: unknown; timestamp: number }> = [];
  const validatedMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    const isLatestMessage = i === messages.length - 1;

    if (!msg || typeof msg !== 'object') {
      releaseConnection(ip);
      return Response.json({ error: 'Each message must be an object' }, { status: 400 });
    }
    const { role, content } = msg as { role: unknown; content: unknown };
    if (role !== 'user' && role !== 'assistant') {
      releaseConnection(ip);
      return Response.json({ error: 'Message role must be "user" or "assistant"' }, { status: 400 });
    }
    if (typeof content !== 'string' || content.length === 0 || content.length > MAX_MESSAGE_LENGTH) {
      releaseConnection(ip);
      return Response.json({ error: `Message content must be a string of 1-${MAX_MESSAGE_LENGTH} chars` }, { status: 400 });
    }

    // Sanitize input (strip invisible/control chars, normalize Unicode)
    const { sanitized, modified, stripped } = sanitizeInput(content);

    // Reject messages with embedded role-spoofing patterns
    if (containsRoleSpoofing(sanitized)) {
      releaseConnection(ip);
      return Response.json({ error: 'Message contains invalid content' }, { status: 400 });
    }

    // Only emit security events and agent notices for the latest message —
    // history messages were already sanitized on their original request.
    if (modified && isLatestMessage) {
      securityEvents.push({
        type: 'security:input-sanitized',
        reason: 'invisible-chars',
        stripped,
        timestamp: Date.now(),
      });
    }

    // Wrap user messages in XML tags so the system prompt's delimiter defense works
    const sanitizationNotice = modified && isLatestMessage
      ? `\n<sanitization_notice>Characters removed from this message before you received it: ${stripped.map(c => `${c.codepoint} (${c.name}) at index ${c.index}`).join(', ')}.</sanitization_notice>`
      : '';
    const finalContent = role === 'user'
      ? `<user_message>${sanitized}</user_message>${sanitizationNotice}`
      : sanitized;

    validatedMessages.push({ role: role as 'user' | 'assistant', content: finalContent });
  }

  // --- Session setup ---
  const sessionId = generateSessionId();
  const parentSessionId = request.headers.get('X-Parent-Session-Id') || undefined;

  // --- Token budget tracking ---
  const tokenBudget = new TokenBudgetAccumulator();

  const stream = new TransformStream();
  const writer = stream.writable.getWriter();
  const encoder = new TextEncoder();

  function sendEvent(data: unknown): void {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    writer.write(encoder.encode(payload)).catch(() => {});
  }

  /** Send an event over SSE AND persist it to the session file. */
  function sendAndPersist(event: SessionEvent): void {
    sendEvent(event);
    sessionWriter.append(sessionId, event);
  }

  // The collector handles LLM trace events — sanitize before sending,
  // but persist the raw event (training data needs the unsanitized version).
  const collector: TraceCollector = {
    onEvent(event: TraceEvent) {
      sendEvent(sanitizeEvent(event));
      sessionWriter.append(sessionId, event);
    },
  };

  // Guard against double-release (abort + normal completion).
  let connectionReleased = false;
  function safeRelease(): void {
    if (!connectionReleased) {
      connectionReleased = true;
      releaseConnection(ip);
    }
  }

  // Release connection slot if the client disconnects early.
  request.signal.addEventListener('abort', safeRelease, { once: true });

  // --- Rate-limit metadata ---
  const rateLimitStatus = getRateLimitStatus(ip);

  // Run the full pipeline in background, stream events as SSE
  (async () => {
    try {
      // Initialize session persistence
      await sessionWriter.create(sessionId, { parentSessionId });

      // Emit session:start as the very first event
      sendAndPersist({
        type: 'session:start',
        sessionId,
        ...(parentSessionId ? { parentSessionId } : {}),
        timestamp: Date.now(),
      });

      // Emit rate-limit status
      sendAndPersist({
        type: 'rate-limit:status',
        remaining: rateLimitStatus.remaining,
        limit: rateLimitStatus.limit,
        activeConnections: rateLimitStatus.activeConnections,
        concurrencyLimit: rateLimitStatus.concurrencyLimit,
        resetMs: rateLimitStatus.resetMs,
        timestamp: Date.now(),
      });

      // Emit initial spend status
      const initialSpend = getSpendStatus();
      sendAndPersist({
        type: 'spend:status',
        ...initialSpend,
        timestamp: Date.now(),
      });

      // Emit any security events from validation phase
      for (const secEvt of securityEvents) {
        sendAndPersist(secEvt as SessionEvent);
      }

      // =====================================================================
      // MEMORY RECALL — pre-amygdala context injection
      // =====================================================================
      let memoryContext: string | undefined;
      try {
        const recalledMemories = await memoryPackage.state.recall({
          limit: 10,
          includeSuperseded: false,
        });
        if (recalledMemories.length > 0) {
          memoryContext = memoryPackage.formatContext();
          // Emit memory:recall trace event
          const memoryTypes: Record<string, number> = {};
          for (const m of recalledMemories) {
            memoryTypes[m.type] = (memoryTypes[m.type] ?? 0) + 1;
          }
          sendAndPersist({
            type: 'memory:recall',
            memoriesRetrieved: recalledMemories.length,
            memoryTypes,
            timestamp: Date.now(),
          } as SessionEvent);
        }
      } catch {
        // Memory recall failure should not break the pipeline
      }

      // =====================================================================
      // AMYGDALA PASS — metacognitive security layer
      // =====================================================================
      // The amygdala sees the raw sanitized message (not XML-wrapped).
      // It classifies intent, assesses threat, rewrites the prompt, and
      // produces a context delegation plan.
      const latestMessage = validatedMessages[validatedMessages.length - 1];
      // Strip <user_message> wrapper for the amygdala — it needs the raw content
      const rawForAmygdala = latestMessage.content
        .replace(/^<user_message>/, '')
        .replace(/<\/user_message>[\s\S]*$/, '');

      // Build request metadata — identity consistency signals for the amygdala
      const isAdmin = session.user?.name === 'Admin';
      const requestMetadata: RequestMetadata = {
        ipHash: hashForPrivacy(ip),
        isAuthenticated: true,  // always true here (auth check above)
        isAdmin,
        sessionIndex: 0,       // TODO: track per-IP session count in memory store
        hourUtc: new Date().getUTCHours(),
        userAgentHash: request.headers.get('user-agent')
          ? hashForPrivacy(request.headers.get('user-agent')!)
          : undefined,
      };

      const amygdalaResult = await amygdala({
        rawMessage: rawForAmygdala,
        conversationHistory: validatedMessages.slice(0, -1),
        memoryContext,
        requestMetadata,
      });

      // Guard: if amygdala returned a history message as the rewrite instead of
      // transforming the current message, fall back to the raw message.
      // This catches an observed LLM confusion where it copies a previous
      // message from conversation history into rewrittenPrompt.
      // Only triggers when the rewrite matches a history message that is NOT
      // the same as the current message — avoids overriding legitimate rewrites
      // of repeated messages.
      if (amygdalaResult.rewrittenPrompt !== rawForAmygdala) {
        const historyContents = validatedMessages.slice(0, -1).map(m => {
          const raw = m.content.replace(/^<user_message>/, '').replace(/<\/user_message>[\s\S]*$/, '');
          return raw;
        });
        const rewriteMatchesHistory = historyContents.some(
          h => amygdalaResult.rewrittenPrompt === h,
        );
        const currentAppearsInHistory = historyContents.some(
          h => h === rawForAmygdala,
        );
        // Only override if the rewrite matches a history message that isn't
        // the same content as the current message (i.e., genuinely wrong copy)
        if (rewriteMatchesHistory && !currentAppearsInHistory) {
          amygdalaResult.rewrittenPrompt = rawForAmygdala;
        }
      }

      // Set per-request threat score for tool-level memory gating (alive-02)
      currentRequestThreatScore = amygdalaResult.threat?.score ?? 0;

      // Track amygdala token usage
      tokenBudget.addActual('amygdala', {
        inputTokens: amygdalaResult.usage.inputTokens,
        outputTokens: amygdalaResult.usage.outputTokens,
        cacheReadTokens: amygdalaResult.usage.cachedTokens ?? 0,
      });

      // Emit amygdala trace events — these are educational, show every decision
      for (const event of amygdalaResult.traceEvents) {
        sendAndPersist(event as SessionEvent);
      }

      // =====================================================================
      // ORCHESTRATOR — route to subagent with scoped tools
      // =====================================================================
      // The orchestrator selects a subagent, filters context, scopes tools,
      // and invokes agent(). It emits its own trace events (route + filter).
      const result = await orchestrator({
        amygdalaResult,
        conversationHistory: validatedMessages.slice(0, -1),
        toolRegistry,
        trace: collector,
        model: 'claude-haiku-4-5',
        maxRounds: 5,
        stream: true,
        isAdmin,
      });

      // Persist orchestrator trace events (already sent via collector for
      // the agent events, but orchestrator:route and orchestrator:context-filter
      // were emitted directly to the collector by the orchestrator)

      // Track subagent token usage
      const subagentUsage = result.agentResult.usage;
      tokenBudget.addActual('subagent', {
        inputTokens: subagentUsage.inputTokens,
        outputTokens: subagentUsage.outputTokens,
        cacheReadTokens: subagentUsage.cachedTokens ?? 0,
      });

      // Emit token budget update
      const budgetSnapshot = tokenBudget.getSnapshot();
      sendAndPersist({
        type: 'token-budget:update' as const,
        ...budgetSnapshot,
        timestamp: Date.now(),
      });

      // Memory writes are now handled by subagents via memory_remember tool
      // with tool-level threat gating (alive-02). extractMemoryWrites removed.

      // =====================================================================
      // LLM-AS-JUDGE — async quality scoring (eval-11)
      // =====================================================================
      // Fire after response completes but before stream closes.
      // Judge failure must never break the response flow.
      if (judge && result.agentResult.message) {
        try {
          const assistantResponse = result.agentResult.message;
          // Use a generated message ID for the judge (matches client-side msg ID pattern)
          const messageId = `msg-${sessionId}-${Date.now()}`;
          const judgeResult = await judge({
            userMessage: rawForAmygdala,
            assistantResponse,
            messageId,
            sessionId,
          });
          if (judgeResult.event) {
            sendAndPersist(judgeResult.event as SessionEvent);
            // Track judge cost in spend tracker
            const judgeCost =
              (judgeResult.event.cost.inputTokens * 1.0 +
                judgeResult.event.cost.outputTokens * 5.0) /
              1_000_000;
            recordSpend(judgeCost);
          }
        } catch {
          // Judge failure must never break the response
        }
      }

      // Record spend after successful completion (amygdala + subagent)
      recordSpend(amygdalaResult.cost + result.agentResult.cost);
      const spendStatus = getSpendStatus();
      sendAndPersist({
        type: 'spend:status',
        ...spendStatus,
        timestamp: Date.now(),
      });
    } catch (err) {
      let userMessage = 'Something went wrong. Please try again.';
      if (err instanceof LLMError) {
        const errorMessages: Record<string, string> = {
          PROVIDER_ERROR: 'The AI service is temporarily unavailable. Please try again.',
          MAX_ROUNDS_EXCEEDED: 'The response took too many steps. Please try a simpler question.',
          TOOL_EXECUTION_ERROR: 'Something went wrong while looking up information. Please try again.',
        };
        userMessage = errorMessages[err.code] ?? userMessage;
      }
      sendEvent({ type: 'error', error: userMessage, timestamp: Date.now() });
    } finally {
      // Finalize session (writes summary, atomic rename .tmp.jsonl → .jsonl)
      try {
        await sessionWriter.finalize(sessionId);
      } catch {
        // Session persistence failure shouldn't break the response
      }
      safeRelease();
      sendEvent({ type: 'done' });
      writer.close().catch(() => {});
    }
  })();

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Session-Id': sessionId,
      'X-RateLimit-Limit': String(rateLimitStatus.limit),
      'X-RateLimit-Remaining': String(rateLimitStatus.remaining),
      'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + rateLimitStatus.resetMs / 1000)),
    },
  });
}
