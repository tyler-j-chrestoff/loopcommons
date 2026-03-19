import { describe, it, expect } from 'vitest';
import { createSubagentRegistry } from '../src/subagent';
import type { AmygdalaResult, AmygdalaIntent } from '../src/amygdala/types';

// ---------------------------------------------------------------------------
// Helper: build a minimal AmygdalaResult for routing tests
// ---------------------------------------------------------------------------

function makeAmygdalaResult(
  intent: AmygdalaIntent,
  threatScore = 0.1,
): AmygdalaResult {
  return {
    rewrittenPrompt: 'test message',
    intent,
    threat: {
      score: threatScore,
      category: 'none',
      reasoning: 'test',
    },
    contextDelegation: {
      historyIndices: [],
      annotations: [],
    },
    traceEvents: [],
    latencyMs: 10,
    usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0 },
    cost: 0.001,
  };
}

// ---------------------------------------------------------------------------
// Blog routing tests
// ---------------------------------------------------------------------------

describe('Blog routing — reader vs writer', () => {
  const registry = createSubagentRegistry();

  it('blog intent with isAdmin=true routes to blog-writer with all 8 tools', () => {
    const config = registry.get('blog', { isAdmin: true });
    expect(config.id).toBe('blog-writer');
    expect(config.toolAllowlist).toContain('list_posts');
    expect(config.toolAllowlist).toContain('read_post');
    expect(config.toolAllowlist).toContain('create_draft');
    expect(config.toolAllowlist).toContain('edit_post');
    expect(config.toolAllowlist).toContain('publish_post');
    expect(config.toolAllowlist).toContain('unpublish_post');
    expect(config.toolAllowlist).toContain('delete_post');
    expect(config.toolAllowlist).toContain('list_drafts');
    expect(config.toolAllowlist.length).toBe(10); // 8 blog tools + memory_recall + memory_remember
  });

  it('blog intent with isAdmin=false routes to blog-reader with read-only tools + memory_recall', () => {
    const config = registry.get('blog', { isAdmin: false });
    expect(config.id).toBe('blog-reader');
    expect(config.toolAllowlist).toEqual(['list_posts', 'read_post', 'memory_recall', 'memory_remember']);
  });

  it('blog intent without context defaults to blog-reader', () => {
    const config = registry.get('blog');
    expect(config.id).toBe('blog-reader');
  });

  it('non-blog intents ignore isAdmin context', () => {
    const resumeAdmin = registry.get('resume', { isAdmin: true });
    const resumeAnon = registry.get('resume', { isAdmin: false });
    expect(resumeAdmin.id).toBe(resumeAnon.id);
    expect(resumeAdmin.id).toBe('resume');

    const convAdmin = registry.get('conversation', { isAdmin: true });
    expect(convAdmin.id).toBe('conversational');
  });

  it('adversarial intent still routes to refusal regardless of isAdmin', () => {
    const config = registry.get('adversarial', { isAdmin: true });
    expect(config.id).toBe('refusal');
  });

  it('list() includes both blog-reader and blog-writer', () => {
    const all = registry.list();
    const ids = all.map(c => c.id);
    expect(ids).toContain('blog-reader');
    expect(ids).toContain('blog-writer');
    expect(ids).not.toContain('blog'); // no generic 'blog' config
  });

  it('non-admin NEVER gets write tools', () => {
    const config = registry.get('blog', { isAdmin: false });
    const writeTools = ['create_draft', 'edit_post', 'publish_post', 'unpublish_post', 'delete_post', 'list_drafts'];
    for (const tool of writeTools) {
      expect(config.toolAllowlist).not.toContain(tool);
    }
  });

  it('blog-reader has a system prompt about reading posts', () => {
    const config = registry.get('blog', { isAdmin: false });
    expect(config.systemPrompt).toMatch(/read|browse|published/i);
  });

  it('blog-writer has a system prompt about managing posts', () => {
    const config = registry.get('blog', { isAdmin: true });
    expect(config.systemPrompt).toMatch(/manage|write|publish/i);
  });
});

// ---------------------------------------------------------------------------
// Orchestrator isAdmin integration
// ---------------------------------------------------------------------------

describe('OrchestratorInput.isAdmin', () => {
  // These test the type contract — actual orchestrator integration
  // is tested in the existing orchestrator tests.
  it('isAdmin field exists on OrchestratorInput type', async () => {
    // Type-level test: this compiles only if isAdmin is a valid field
    const input: import('../src/orchestrator/types').OrchestratorInput = {
      amygdalaResult: makeAmygdalaResult('blog'),
      conversationHistory: [],
      toolRegistry: { get: () => undefined, has: () => false, list: () => [], toProviderFormat: () => ({}) },
      isAdmin: true,
    };
    expect(input.isAdmin).toBe(true);
  });
});
