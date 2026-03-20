import { describe, it, expect, vi } from 'vitest';
import type { AgentIdentity, LineageRecord } from '../src/identity';
import { computeIdentity, buildAgentIdentity, getCommitSha, computeToolDiff } from '../src/identity';
import { buildSystemPrompt } from '../src/tool/derive';
import type { ToolPackage } from '../src/tool';
import { z } from 'zod';

describe('AgentIdentity types', () => {
  it('AgentIdentity has required fields', () => {
    const identity: AgentIdentity = {
      commitSha: 'abc123',
      toolCompositionHash: 'sha256-deadbeef',
      derivedPromptHash: 'sha256-cafebabe',
    };
    expect(identity.commitSha).toBe('abc123');
    expect(identity.toolCompositionHash).toBe('sha256-deadbeef');
    expect(identity.derivedPromptHash).toBe('sha256-cafebabe');
  });

  it('LineageRecord links parent to child with tool diff', () => {
    const parent: AgentIdentity = {
      commitSha: 'abc123',
      toolCompositionHash: 'sha256-aaa',
      derivedPromptHash: 'sha256-bbb',
    };
    const child: AgentIdentity = {
      commitSha: 'def456',
      toolCompositionHash: 'sha256-ccc',
      derivedPromptHash: 'sha256-ddd',
    };
    const record: LineageRecord = {
      parent,
      child,
      toolDiff: {
        added: ['blog_write'],
        removed: ['blog_read'],
      },
    };
    expect(record.parent).toBe(parent);
    expect(record.child).toBe(child);
    expect(record.toolDiff.added).toEqual(['blog_write']);
    expect(record.toolDiff.removed).toEqual(['blog_read']);
  });

  it('LineageRecord allows null parent for genesis', () => {
    const record: LineageRecord = {
      parent: null,
      child: {
        commitSha: 'abc123',
        toolCompositionHash: 'sha256-aaa',
        derivedPromptHash: 'sha256-bbb',
      },
      toolDiff: { added: ['get_resume'], removed: [] },
    };
    expect(record.parent).toBeNull();
  });
});

describe('computeIdentity', () => {
  it('produces a deterministic hash from commit + tool names', async () => {
    const id1 = await computeIdentity('abc123', ['get_resume', 'memory_recall']);
    const id2 = await computeIdentity('abc123', ['get_resume', 'memory_recall']);
    expect(id1).toBe(id2);
  });

  it('sorts tool names so order does not matter', async () => {
    const id1 = await computeIdentity('abc123', ['memory_recall', 'get_resume']);
    const id2 = await computeIdentity('abc123', ['get_resume', 'memory_recall']);
    expect(id1).toBe(id2);
  });

  it('different commits produce different hashes', async () => {
    const id1 = await computeIdentity('abc123', ['get_resume']);
    const id2 = await computeIdentity('def456', ['get_resume']);
    expect(id1).not.toBe(id2);
  });

  it('different tool sets produce different hashes', async () => {
    const id1 = await computeIdentity('abc123', ['get_resume']);
    const id2 = await computeIdentity('abc123', ['get_resume', 'memory_recall']);
    expect(id1).not.toBe(id2);
  });

  it('returns a hex string', async () => {
    const id = await computeIdentity('abc123', ['get_resume']);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ---------------------------------------------------------------------------
// al-03: buildAgentIdentity — full identity from commit + packages + prompt
// ---------------------------------------------------------------------------

function makeTool(name: string) {
  return { name, description: `${name} tool`, parameters: z.object({}), execute: async () => '' };
}

function makePkg(name: string, toolNames: string[], overrides: Partial<ToolPackage['metadata']> = {}): ToolPackage {
  return {
    tools: toolNames.map(makeTool),
    formatContext: () => '',
    metadata: {
      name,
      capabilities: ['test'],
      intent: overrides.intent ?? ['test'],
      sideEffects: overrides.sideEffects ?? false,
      ...overrides,
    },
  };
}

describe('buildAgentIdentity', () => {
  const packages = [
    makePkg('resume', ['get_resume']),
    makePkg('memory', ['memory_recall', 'memory_remember'], { intent: ['memory'], persistence: true, scope: 'private', consolidation: true }),
  ];

  it('returns a complete AgentIdentity', async () => {
    const id = await buildAgentIdentity('abc123', packages, 'You are a helper.');
    expect(id.commitSha).toBe('abc123');
    expect(id.toolCompositionHash).toMatch(/^[0-9a-f]{64}$/);
    expect(id.derivedPromptHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic — same inputs produce same identity', async () => {
    const id1 = await buildAgentIdentity('abc123', packages, 'You are a helper.');
    const id2 = await buildAgentIdentity('abc123', packages, 'You are a helper.');
    expect(id1).toEqual(id2);
  });

  it('different commits produce different identities', async () => {
    const id1 = await buildAgentIdentity('abc123', packages, 'domain');
    const id2 = await buildAgentIdentity('def456', packages, 'domain');
    expect(id1.toolCompositionHash).not.toBe(id2.toolCompositionHash);
    expect(id1.derivedPromptHash).not.toBe(id2.derivedPromptHash);
  });

  it('different tool packages produce different composition hashes', async () => {
    const pkgs2 = [makePkg('resume', ['get_resume'])];
    const id1 = await buildAgentIdentity('abc123', packages, 'domain');
    const id2 = await buildAgentIdentity('abc123', pkgs2, 'domain');
    expect(id1.toolCompositionHash).not.toBe(id2.toolCompositionHash);
  });

  it('different domain knowledge produces different prompt hashes but same composition hash', async () => {
    const id1 = await buildAgentIdentity('abc123', packages, 'You are a helper.');
    const id2 = await buildAgentIdentity('abc123', packages, 'You are a security auditor.');
    expect(id1.toolCompositionHash).toBe(id2.toolCompositionHash);
    expect(id1.derivedPromptHash).not.toBe(id2.derivedPromptHash);
  });
});

// ---------------------------------------------------------------------------
// al-04: getCommitSha — reads from env or git
// ---------------------------------------------------------------------------

describe('getCommitSha', () => {
  it('returns RAILWAY_GIT_COMMIT_SHA when set', () => {
    const original = process.env.RAILWAY_GIT_COMMIT_SHA;
    try {
      process.env.RAILWAY_GIT_COMMIT_SHA = 'railway-sha-abc';
      expect(getCommitSha()).toBe('railway-sha-abc');
    } finally {
      if (original === undefined) delete process.env.RAILWAY_GIT_COMMIT_SHA;
      else process.env.RAILWAY_GIT_COMMIT_SHA = original;
    }
  });

  it('falls back to git rev-parse HEAD in dev', () => {
    const original = process.env.RAILWAY_GIT_COMMIT_SHA;
    try {
      delete process.env.RAILWAY_GIT_COMMIT_SHA;
      const sha = getCommitSha();
      // In the dev environment (this repo), should return a 40-char hex SHA
      expect(sha).toMatch(/^[0-9a-f]{40}$/);
    } finally {
      if (original !== undefined) process.env.RAILWAY_GIT_COMMIT_SHA = original;
    }
  });
});

// ---------------------------------------------------------------------------
// computeToolDiff
// ---------------------------------------------------------------------------

describe('computeToolDiff', () => {
  it('detects added tools', () => {
    const diff = computeToolDiff(['a', 'b'], ['a', 'b', 'c']);
    expect(diff).toEqual({ added: ['c'], removed: [] });
  });

  it('detects removed tools', () => {
    const diff = computeToolDiff(['a', 'b', 'c'], ['a', 'b']);
    expect(diff).toEqual({ added: [], removed: ['c'] });
  });

  it('detects both added and removed', () => {
    const diff = computeToolDiff(['a', 'b'], ['b', 'c']);
    expect(diff).toEqual({ added: ['c'], removed: ['a'] });
  });

  it('returns empty diff for identical sets', () => {
    const diff = computeToolDiff(['a', 'b'], ['a', 'b']);
    expect(diff).toEqual({ added: [], removed: [] });
  });

  it('is order-independent', () => {
    const diff1 = computeToolDiff(['b', 'a'], ['a', 'c']);
    const diff2 = computeToolDiff(['a', 'b'], ['c', 'a']);
    expect(diff1).toEqual(diff2);
  });
});
