import { describe, it, expect } from 'vitest';
import type { AgentIdentity, LineageRecord } from '../src/identity';
import { computeToolDiff, buildLineageRecord } from '../src/identity';

describe('buildLineageRecord', () => {
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

  it('builds a lineage record with tool diff', () => {
    const record = buildLineageRecord(
      parent,
      child,
      ['get_resume', 'memory_recall'],
      ['get_resume', 'memory_recall', 'blog_write'],
    );
    expect(record.parent).toBe(parent);
    expect(record.child).toBe(child);
    expect(record.toolDiff.added).toEqual(['blog_write']);
    expect(record.toolDiff.removed).toEqual([]);
  });

  it('returns null parent for genesis (no previous identity)', () => {
    const record = buildLineageRecord(
      null,
      child,
      [],
      ['get_resume'],
    );
    expect(record.parent).toBeNull();
    expect(record.toolDiff.added).toEqual(['get_resume']);
    expect(record.toolDiff.removed).toEqual([]);
  });

  it('captures both additions and removals', () => {
    const record = buildLineageRecord(
      parent,
      child,
      ['get_resume', 'old_tool'],
      ['get_resume', 'new_tool'],
    );
    expect(record.toolDiff.added).toEqual(['new_tool']);
    expect(record.toolDiff.removed).toEqual(['old_tool']);
  });

  it('returns empty diff when tools are identical', () => {
    const record = buildLineageRecord(
      parent,
      child,
      ['get_resume'],
      ['get_resume'],
    );
    expect(record.toolDiff.added).toEqual([]);
    expect(record.toolDiff.removed).toEqual([]);
  });
});
