import {
  createAgentCore,
  createRouter,
  createWebAdapter,
  createJudge,
  hashForPrivacy,
  getCommitSha,
  buildAgentIdentity,
  LLMError,
} from '@loopcommons/llm';
import type { TraceEvent } from '@loopcommons/llm';
import { createKeywordMemoryPackage } from '@loopcommons/memory/keyword';
import { createResumePackage } from '@/tools/resume';
import { createProjectPackage } from '@/tools/project';
import { createBlogToolPackage } from '@/tools/blog';
import { createArenaQueryPackage } from '@/tools/arena-query';
import { getTournamentManager } from '@/lib/tournament-manager';
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

const blogDataDir = process.env.BLOG_DATA_DIR ?? 'data/blog';
const memoryDataDir = process.env.MEMORY_DATA_DIR ?? 'data/memory';

// --- ToolPackage assembly ---
const resumePackage = createResumePackage();
const projectPackage = createProjectPackage();
const blogPackage = createBlogToolPackage({ dataDir: blogDataDir, variant: 'writer' });

// Mutable per-request threat score. The closure is read at tool execution time
// (during subagent invocation), not at construction time.
let currentRequestThreatScore = 0;
const memoryPackage = createKeywordMemoryPackage({
  filePath: `${memoryDataDir}/world-model.json`,
  getThreatScore: () => currentRequestThreatScore,
});

const arenaManager = getTournamentManager();
const arenaPackage = createArenaQueryPackage({
  getSnapshot: () => arenaManager.getSnapshot(),
  getStatus: () => arenaManager.getStatus(),
});

const toolPackages = [resumePackage, projectPackage, blogPackage, memoryPackage, arenaPackage];

const agentCore = createAgentCore({
  toolPackages,
  onThreatScore: (score) => { currentRequestThreatScore = score; },
});

const router = createRouter({
  adapters: [createWebAdapter({ channelId: 'web-main' })],
  core: agentCore,
});

const sessionWriter = new FileSessionWriter();
const judge = process.env.ENABLE_LLM_JUDGE === 'true' ? createJudge() : null;

/** Generate a short unique session ID (URL-safe, collision-resistant). */
function generateSessionId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 16);
}

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

  // --- Extract raw message for the agent core ---
  const latestMessage = validatedMessages[validatedMessages.length - 1];
  const rawMessage = latestMessage.content
    .replace(/^<user_message>/, '')
    .replace(/<\/user_message>[\s\S]*$/, '');

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

  function sendAndPersist(event: SessionEvent): void {
    sendEvent(event);
    sessionWriter.append(sessionId, event);
  }

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

  // --- Build identity for the agent core ---
  const isAdmin = session.user?.name === 'Admin';

  // Run the agent pipeline in background, stream events as SSE
  (async () => {
    try {
      // Initialize session persistence
      await sessionWriter.create(sessionId, { parentSessionId });

      // Compute content-addressed identity for this session
      const commitSha = getCommitSha();
      const agentIdentity = await buildAgentIdentity(commitSha, toolPackages, '');

      // Emit session:start as the very first event
      sendAndPersist({
        type: 'session:start',
        sessionId,
        ...(parentSessionId ? { parentSessionId } : {}),
        interfaceId: 'web',
        agentIdentity,
        timestamp: Date.now(),
      });

      sendAndPersist({
        type: 'rate-limit:status',
        remaining: rateLimitStatus.remaining,
        limit: rateLimitStatus.limit,
        activeConnections: rateLimitStatus.activeConnections,
        concurrencyLimit: rateLimitStatus.concurrencyLimit,
        resetMs: rateLimitStatus.resetMs,
        timestamp: Date.now(),
      });

      const initialSpend = getSpendStatus();
      sendAndPersist({
        type: 'spend:status',
        ...initialSpend,
        timestamp: Date.now(),
      });

      for (const secEvt of securityEvents) {
        sendAndPersist(secEvt as SessionEvent);
      }

      // =====================================================================
      // ROUTER — normalize → core (memory → amygdala → orchestrator → subagent)
      // =====================================================================
      const routerOutput = await router.process(
        {
          raw: { message: rawMessage, userId: session.user?.name ?? 'anonymous', isAdmin, isAuthenticated: true, sessionId },
          channelType: 'web',
        },
        {
          stream: true,
          conversationHistory: validatedMessages.slice(0, -1),
          identityOverrides: {
            commitSha: getCommitSha(),
            requestMetadata: {
              ipHash: hashForPrivacy(ip),
              isAuthenticated: true,
              isAdmin,
              sessionIndex: 0, // TODO: track per-IP session count
              hourUtc: new Date().getUTCHours(),
              userAgentHash: request.headers.get('user-agent')
                ? hashForPrivacy(request.headers.get('user-agent')!)
                : undefined,
            },
          },
          onTraceEvent(event: TraceEvent) {
            // Sanitize before sending to client, persist raw for training data
            sendEvent(sanitizeEvent(event));
            sessionWriter.append(sessionId, event);
          },
        },
      );
      const coreResult = routerOutput.coreResult;

      // Track token usage for budget visualization
      tokenBudget.addActual('amygdala', {
        inputTokens: coreResult.amygdalaUsage.inputTokens,
        outputTokens: coreResult.amygdalaUsage.outputTokens,
        cacheReadTokens: coreResult.amygdalaUsage.cachedTokens ?? 0,
      });
      tokenBudget.addActual('subagent', {
        inputTokens: coreResult.usage.inputTokens - coreResult.amygdalaUsage.inputTokens,
        outputTokens: coreResult.usage.outputTokens - coreResult.amygdalaUsage.outputTokens,
        cacheReadTokens: (coreResult.usage.cachedTokens ?? 0) - (coreResult.amygdalaUsage.cachedTokens ?? 0),
      });

      const budgetSnapshot = tokenBudget.getSnapshot();
      sendAndPersist({
        type: 'token-budget:update' as const,
        ...budgetSnapshot,
        timestamp: Date.now(),
      });

      // =====================================================================
      // LLM-AS-JUDGE — async quality scoring
      // =====================================================================
      if (judge && coreResult.response) {
        try {
          const messageId = `msg-${sessionId}-${Date.now()}`;
          const judgeResult = await judge({
            userMessage: rawMessage,
            assistantResponse: coreResult.response,
            messageId,
            sessionId,
          });
          if (judgeResult.event) {
            sendAndPersist(judgeResult.event as SessionEvent);
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

      // Record spend after successful completion
      recordSpend(coreResult.cost);
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
