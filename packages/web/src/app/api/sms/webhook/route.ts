import {
  createAgentCore,
  createRouter,
  createSmsAdapter,
  validateTwilioSignature,
} from '@loopcommons/llm';
import { createKeywordMemoryPackage } from '@loopcommons/memory/keyword';
import { createResumePackage } from '@/tools/resume';
import { createProjectPackage } from '@/tools/project';
import { createBlogToolPackage } from '@/tools/blog';
import { createArenaQueryPackage } from '@/tools/arena-query';
import { getTournamentManager } from '@/lib/tournament-manager';
import { checkRateLimit, acquireConnection, releaseConnection } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// ---------------------------------------------------------------------------
// Module-level singletons (reused across requests)
// ---------------------------------------------------------------------------

const blogDataDir = process.env.BLOG_DATA_DIR ?? 'data/blog';
const memoryDataDir = process.env.MEMORY_DATA_DIR ?? 'data/memory';

const resumePackage = createResumePackage();
const projectPackage = createProjectPackage();
const blogPackage = createBlogToolPackage({ dataDir: blogDataDir, variant: 'writer' });

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
  adapters: [createSmsAdapter()],
  core: agentCore,
});

// ---------------------------------------------------------------------------
// TwiML response helpers
// ---------------------------------------------------------------------------

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function twimlResponse(message: string, status = 200): Response {
  const xml = message
    ? `<Response><Message>${escapeXml(message)}</Message></Response>`
    : '<Response/>';
  return new Response(xml, {
    status,
    headers: { 'Content-Type': 'text/xml' },
  });
}

// ---------------------------------------------------------------------------
// POST handler
// ---------------------------------------------------------------------------

export async function POST(request: Request): Promise<Response> {
  // 1. Parse form-urlencoded body
  const bodyText = await request.text();
  const urlParams = new URLSearchParams(bodyText);
  const params: Record<string, string> = {};
  urlParams.forEach((value, key) => { params[key] = value; });

  const phoneNumber = params.From ?? 'unknown';

  // 2. Validate Twilio auth token is configured
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return twimlResponse('Service temporarily unavailable.', 500);
  }

  // 3. Validate Twilio signature
  const signature = request.headers.get('x-twilio-signature') ?? '';
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host') ?? '';
  const url = `${proto}://${host}/api/sms/webhook`;

  if (!validateTwilioSignature(authToken, signature, url, params)) {
    return twimlResponse('', 401);
  }

  // 4. Rate limit by phone number
  const rateCheck = checkRateLimit(phoneNumber);
  if (!rateCheck.allowed) {
    return twimlResponse('Too many messages. Please slow down and try again shortly.', 429);
  }

  if (!acquireConnection(phoneNumber)) {
    return twimlResponse('Please wait for your previous message to finish processing.', 429);
  }

  // 5. Process via Router
  try {
    const output = await router.process(
      { raw: params, channelType: 'sms' },
      { stream: false },
    );

    const formatted = output.channelFormatted as { twiml: string };
    return new Response(formatted.twiml, {
      status: 200,
      headers: { 'Content-Type': 'text/xml' },
    });
  } catch {
    return twimlResponse('Sorry, something went wrong. Please try again.');
  } finally {
    releaseConnection(phoneNumber);
  }
}
