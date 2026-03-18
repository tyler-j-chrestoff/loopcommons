import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { BlogFrontmatterSchema, SLUG_REGEX } from '../src/blog/types';
import type { BlogPost, BlogPostSummary } from '../src/blog/types';

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

describe('SLUG_REGEX', () => {
  it('accepts valid slugs', () => {
    expect(SLUG_REGEX.test('hello-world')).toBe(true);
    expect(SLUG_REGEX.test('a')).toBe(true);
    expect(SLUG_REGEX.test('my-first-post')).toBe(true);
    expect(SLUG_REGEX.test('post123')).toBe(true);
    expect(SLUG_REGEX.test('2026-03-18-launch')).toBe(true);
  });

  it('rejects invalid slugs', () => {
    expect(SLUG_REGEX.test('')).toBe(false);
    expect(SLUG_REGEX.test('-leading')).toBe(false);
    expect(SLUG_REGEX.test('trailing-')).toBe(false);
    expect(SLUG_REGEX.test('double--dash')).toBe(false);
    expect(SLUG_REGEX.test('UPPER')).toBe(false);
    expect(SLUG_REGEX.test('has space')).toBe(false);
    expect(SLUG_REGEX.test('has_underscore')).toBe(false);
    expect(SLUG_REGEX.test('../etc/passwd')).toBe(false);
    expect(SLUG_REGEX.test('foo/bar')).toBe(false);
    expect(SLUG_REGEX.test('.hidden')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// BlogFrontmatterSchema
// ---------------------------------------------------------------------------

describe('BlogFrontmatterSchema', () => {
  const validFrontmatter = {
    title: 'Hello World',
    slug: 'hello-world',
    status: 'draft' as const,
    createdAt: '2026-03-18T12:00:00Z',
    updatedAt: '2026-03-18T12:00:00Z',
  };

  it('parses valid frontmatter with required fields only', () => {
    const result = BlogFrontmatterSchema.safeParse(validFrontmatter);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBe('Hello World');
      expect(result.data.slug).toBe('hello-world');
      expect(result.data.status).toBe('draft');
      expect(result.data.tags).toBeUndefined();
      expect(result.data.excerpt).toBeUndefined();
      expect(result.data.publishedAt).toBeUndefined();
    }
  });

  it('parses valid frontmatter with all fields', () => {
    const full = {
      ...validFrontmatter,
      status: 'published' as const,
      tags: ['ai', 'research'],
      excerpt: 'A short summary',
      publishedAt: '2026-03-18T14:00:00Z',
    };
    const result = BlogFrontmatterSchema.safeParse(full);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tags).toEqual(['ai', 'research']);
      expect(result.data.excerpt).toBe('A short summary');
      expect(result.data.publishedAt).toBe('2026-03-18T14:00:00Z');
    }
  });

  it('rejects invalid status', () => {
    const result = BlogFrontmatterSchema.safeParse({
      ...validFrontmatter,
      status: 'archived',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid slug', () => {
    const result = BlogFrontmatterSchema.safeParse({
      ...validFrontmatter,
      slug: '../hack',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    expect(BlogFrontmatterSchema.safeParse({}).success).toBe(false);
    expect(BlogFrontmatterSchema.safeParse({ title: 'X' }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Type shape tests (compile-time + runtime validation)
// ---------------------------------------------------------------------------

describe('BlogPost type', () => {
  it('has expected shape', () => {
    const post: BlogPost = {
      slug: 'test',
      title: 'Test Post',
      content: '# Hello\n\nBody here.',
      status: 'draft',
      tags: [],
      createdAt: '2026-03-18T12:00:00Z',
      updatedAt: '2026-03-18T12:00:00Z',
    };
    expect(post.slug).toBe('test');
    expect(post.content).toContain('# Hello');
    expect(post.status).toBe('draft');
  });
});

describe('BlogPostSummary type', () => {
  it('has expected shape (no content field)', () => {
    const summary: BlogPostSummary = {
      slug: 'test',
      title: 'Test Post',
      status: 'published',
      tags: ['ai'],
      excerpt: 'Short summary',
      createdAt: '2026-03-18T12:00:00Z',
      updatedAt: '2026-03-18T12:00:00Z',
      publishedAt: '2026-03-18T14:00:00Z',
    };
    expect(summary.slug).toBe('test');
    expect(summary.publishedAt).toBeDefined();
    // @ts-expect-error — BlogPostSummary should not have content
    expect(summary.content).toBeUndefined();
  });
});
