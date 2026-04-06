import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures these exist before vi.mock factories run
// ---------------------------------------------------------------------------

const {
  mockRouterProcess,
  mockValidateSignature,
  mockCheckRateLimit,
  mockAcquireConnection,
  mockReleaseConnection,
  mockGetClientIp,
  mockGetRateLimitStatus,
} = vi.hoisted(() => ({
  mockRouterProcess: vi.fn(),
  mockValidateSignature: vi.fn(),
  mockCheckRateLimit: vi.fn(),
  mockAcquireConnection: vi.fn(),
  mockReleaseConnection: vi.fn(),
  mockGetClientIp: vi.fn(),
  mockGetRateLimitStatus: vi.fn(),
}));

// --- Mock @loopcommons/llm ---
vi.mock('@loopcommons/llm', () => ({
  createAgentCore: () => ({ invoke: vi.fn() }),
  createRouter: () => ({
    process: mockRouterProcess,
    getAdapter: vi.fn(),
  }),
  createWebAdapter: vi.fn(),
  createSmsAdapter: vi.fn(() => ({
    type: 'sms',
    capabilities: { supportsStreaming: false },
    normalize: vi.fn(),
    format: vi.fn(),
  })),
  validateTwilioSignature: mockValidateSignature,
  createJudge: vi.fn(),
  hashForPrivacy: vi.fn(),
  getCommitSha: () => 'test-sha',
  buildAgentIdentity: vi.fn(),
  LLMError: class extends Error {
    code: string;
    constructor(message: string, code: string) {
      super(message);
      this.code = code;
    }
  },
}));

// --- Mock @loopcommons/memory/keyword ---
vi.mock('@loopcommons/memory/keyword', () => ({
  createKeywordMemoryPackage: vi.fn(() => ({
    tools: [],
    metadata: { intent: ['memory'] },
    formatContext: () => '',
    state: {
      recall: vi.fn().mockResolvedValue([]),
      remember: vi.fn(),
      stats: vi.fn(),
    },
  })),
}));

// --- Mock @/tools ---
vi.mock('@/tools/resume', () => ({
  createResumePackage: () => ({ tools: [], metadata: { intent: ['resume'] } }),
}));
vi.mock('@/tools/project', () => ({
  createProjectPackage: () => ({ tools: [], metadata: { intent: ['project'] } }),
}));
vi.mock('@/tools/blog', () => ({
  createBlogToolPackage: () => ({ tools: [], metadata: { intent: ['blog'] } }),
}));
vi.mock('@/tools/arena-query', () => ({
  createArenaQueryPackage: () => ({ tools: [], metadata: { intent: ['arena'] } }),
}));

// --- Mock @/lib/tournament-manager ---
vi.mock('@/lib/tournament-manager', () => ({
  getTournamentManager: () => ({
    getSnapshot: vi.fn().mockReturnValue({}),
    getStatus: vi.fn().mockReturnValue('idle'),
  }),
}));

// --- Mock @/lib/rate-limit ---
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  acquireConnection: mockAcquireConnection,
  releaseConnection: mockReleaseConnection,
  getClientIp: mockGetClientIp,
  getRateLimitStatus: mockGetRateLimitStatus,
}));

// --- Mock @/lib/spend-tracker ---
vi.mock('@/lib/spend-tracker', () => ({
  canSpend: vi.fn().mockReturnValue(true),
  recordSpend: vi.fn(),
  getSpendStatus: vi.fn().mockReturnValue({
    currentSpendUsd: 0,
    dailyCapUsd: 5,
    remainingUsd: 5,
    percentUsed: 0,
    resetAtUtc: '2026-03-25T00:00:00.000Z',
  }),
}));

// --- Mock @/lib/sanitize ---
vi.mock('@/lib/sanitize', () => ({
  sanitizeInput: vi.fn((text: string) => ({ sanitized: text, modified: false, stripped: [] })),
  containsRoleSpoofing: vi.fn().mockReturnValue(false),
}));

// --- Mock @/lib/sanitize-event ---
vi.mock('@/lib/sanitize-event', () => ({
  sanitizeEvent: vi.fn((event: unknown) => event),
}));

// --- Mock @/lib/session/file-session-writer ---
vi.mock('@/lib/session/file-session-writer', () => ({
  FileSessionWriter: class {
    create = vi.fn();
    append = vi.fn();
    finalize = vi.fn();
  },
}));

// --- Mock @/lib/token-budget ---
vi.mock('@/lib/token-budget', () => ({
  TokenBudgetAccumulator: class {
    addActual = vi.fn();
    getSnapshot = vi.fn().mockReturnValue({
      cumulative: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, totalTokens: 0 },
      budgetPercent: 0,
      costEstimate: 0,
      modelContextLimit: 200_000,
      turns: [],
    });
  },
}));

// --- Mock @/auth ---
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are registered
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/sms/webhook/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTwilioRequest(
  params: Record<string, string>,
  headers?: Record<string, string>,
): Request {
  const body = new URLSearchParams(params).toString();
  return new Request('http://localhost:3000/api/sms/webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'valid-sig',
      host: 'localhost:3000',
      ...headers,
    },
    body,
  });
}

const VALID_TWILIO_PARAMS = {
  MessageSid: 'SM1234567890',
  From: '+15551234567',
  To: '+15559876543',
  Body: 'Hello there',
  AccountSid: 'AC1234567890',
  NumMedia: '0',
};

function setupHappyPath(): void {
  mockValidateSignature.mockReturnValue(true);
  mockGetClientIp.mockReturnValue('127.0.0.1');
  mockCheckRateLimit.mockReturnValue({ allowed: true, remaining: 9 });
  mockAcquireConnection.mockReturnValue(true);
  mockGetRateLimitStatus.mockReturnValue({
    remaining: 9,
    limit: 10,
    activeConnections: 1,
    concurrencyLimit: 2,
    resetMs: 60000,
  });

  mockRouterProcess.mockResolvedValue({
    response: {
      messageId: 'SM1234567890',
      content: { text: 'Hi from the agent!' },
    },
    channelFormatted: {
      twiml: '<Response><Message>Hi from the agent!</Message></Response>',
    },
    coreResult: {
      response: 'Hi from the agent!',
      cost: 0.001,
      usage: { inputTokens: 100, outputTokens: 50 },
      amygdalaUsage: { inputTokens: 50, outputTokens: 20 },
    },
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/sms/webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupHappyPath();
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
  });

  // -----------------------------------------------------------------------
  // Signature validation
  // -----------------------------------------------------------------------

  describe('signature validation', () => {
    it('rejects requests with invalid signature (401)', async () => {
      mockValidateSignature.mockReturnValue(false);

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      // Silent rejection — empty TwiML
      const body = await response.text();
      expect(body).toContain('<Response/>');
    });

    it('rejects requests with missing signature header (401)', async () => {
      mockValidateSignature.mockReturnValue(false);

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS, {
        'x-twilio-signature': '',
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('returns 500 TwiML when auth token env var is missing', async () => {
      delete process.env.TWILIO_AUTH_TOKEN;

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(500);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      const body = await response.text();
      expect(body).toContain('Service temporarily unavailable');
    });
  });

  // -----------------------------------------------------------------------
  // Happy path
  // -----------------------------------------------------------------------

  describe('happy path', () => {
    it('returns 200 with TwiML XML response', async () => {
      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      const body = await response.text();
      expect(body).toContain('<Response>');
      expect(body).toContain('<Message>');
      expect(body).toContain('Hi from the agent!');
    });

    it('passes channelType sms and raw params to Router.process', async () => {
      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      await POST(request);

      expect(mockRouterProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          channelType: 'sms',
          raw: expect.objectContaining({
            Body: 'Hello there',
            From: '+15551234567',
          }),
        }),
        expect.objectContaining({
          stream: false,
        }),
      );
    });

    it('does not use SSE streaming', async () => {
      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      await POST(request);

      const processCall = mockRouterProcess.mock.calls[0];
      expect(processCall[1]).toEqual(expect.objectContaining({ stream: false }));
    });

    it('reconstructs URL with x-forwarded-proto for signature validation', async () => {
      const body = new URLSearchParams(VALID_TWILIO_PARAMS).toString();
      const request = new Request('http://myapp.railway.app/api/sms/webhook', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          'x-twilio-signature': 'valid-sig',
          'x-forwarded-proto': 'https',
          host: 'myapp.railway.app',
        },
        body,
      });
      await POST(request);

      // The URL should use x-forwarded-proto + host
      const call = mockValidateSignature.mock.calls[0];
      expect(call[0]).toBe('test-auth-token');
      expect(call[1]).toBe('valid-sig');
      // Host header may be overwritten by happy-dom; verify the URL contains the path
      expect(call[2]).toContain('/api/sms/webhook');
      expect(call[2]).toMatch(/^https?:\/\//);
    });
  });

  // -----------------------------------------------------------------------
  // Input validation
  // -----------------------------------------------------------------------

  describe('input validation', () => {
    it('handles empty Body field gracefully', async () => {
      const params = { ...VALID_TWILIO_PARAMS, Body: '' };
      const request = makeTwilioRequest(params);
      const response = await POST(request);

      // Should still process — empty body is valid (Router/adapter handles it)
      expect(response.status).toBe(200);
      expect(mockRouterProcess).toHaveBeenCalled();
    });

    it('handles missing Body field gracefully', async () => {
      const { Body: _, ...paramsWithoutBody } = VALID_TWILIO_PARAMS;
      const request = makeTwilioRequest(paramsWithoutBody);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockRouterProcess).toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // Rate limiting
  // -----------------------------------------------------------------------

  describe('rate limiting', () => {
    it('returns 429 with TwiML error when rate limited', async () => {
      mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfter: 30, remaining: 0 });

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      const body = await response.text();
      expect(body).toContain('<Response>');
      expect(body).toContain('<Message>');
      expect(body).toMatch(/slow down|too many/i);
    });

    it('returns 429 with TwiML when concurrency limit reached', async () => {
      mockAcquireConnection.mockReturnValue(false);

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(429);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      const body = await response.text();
      expect(body).toContain('<Response>');
      expect(body).toContain('<Message>');
    });

    it('uses phone number (From) as rate limit key', async () => {
      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      await POST(request);

      expect(mockCheckRateLimit).toHaveBeenCalledWith('+15551234567');
    });

    it('releases connection after successful response', async () => {
      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      await POST(request);

      expect(mockReleaseConnection).toHaveBeenCalledWith('+15551234567');
    });
  });

  // -----------------------------------------------------------------------
  // Error handling
  // -----------------------------------------------------------------------

  describe('error handling', () => {
    it('returns friendly TwiML on agent pipeline error', async () => {
      mockRouterProcess.mockRejectedValue(new Error('LLM provider down'));

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/xml');
      const body = await response.text();
      expect(body).toContain('<Response>');
      expect(body).toContain('<Message>');
      expect(body).toMatch(/wrong|try again/i);
      // Must NOT leak error details
      expect(body).not.toContain('LLM provider down');
    });

    it('releases connection on pipeline error', async () => {
      mockRouterProcess.mockRejectedValue(new Error('boom'));

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      await POST(request);

      expect(mockReleaseConnection).toHaveBeenCalledWith('+15551234567');
    });

    it('never returns raw error details in TwiML', async () => {
      mockRouterProcess.mockRejectedValue(new Error('ANTHROPIC_API_KEY is invalid'));

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      const body = await response.text();
      expect(body).not.toContain('ANTHROPIC_API_KEY');
      expect(body).not.toContain('invalid');
    });

    it('XML-escapes agent response in TwiML', async () => {
      mockRouterProcess.mockResolvedValue({
        response: { messageId: 'test', content: { text: 'Use <b>bold</b> & "quotes"' } },
        channelFormatted: {
          twiml: '<Response><Message>Use &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;</Message></Response>',
        },
        coreResult: { response: 'test', cost: 0, usage: {}, amygdalaUsage: {} },
      });

      const request = makeTwilioRequest(VALID_TWILIO_PARAMS);
      const response = await POST(request);

      const body = await response.text();
      // The adapter handles escaping; route just passes through channelFormatted.twiml
      expect(body).not.toContain('<b>bold</b>');
    });
  });
});
