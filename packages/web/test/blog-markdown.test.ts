import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../src/lib/blog/markdown';

// ---------------------------------------------------------------------------
// parseMarkdown
// ---------------------------------------------------------------------------

describe('parseMarkdown', () => {
  it('parses frontmatter and renders markdown to HTML', async () => {
    const raw = [
      '---',
      'title: Hello World',
      'slug: hello-world',
      'status: published',
      'tags: [ai, research]',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      'publishedAt: "2026-03-18T00:00:00.000Z"',
      '---',
      '',
      '# Hello',
      '',
      'This is a paragraph.',
    ].join('\n');

    const result = await parseMarkdown(raw);

    expect(result.frontmatter.title).toBe('Hello World');
    expect(result.frontmatter.slug).toBe('hello-world');
    expect(result.frontmatter.tags).toEqual(['ai', 'research']);
    expect(result.html).toContain('<h1');
    expect(result.html).toContain('Hello');
    expect(result.html).toContain('<p>');
    expect(result.html).toContain('This is a paragraph.');
  });

  it('renders GFM tables', async () => {
    const raw = [
      '---',
      'title: Tables',
      'slug: tables',
      'status: draft',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      '---',
      '',
      '| A | B |',
      '|---|---|',
      '| 1 | 2 |',
    ].join('\n');

    const result = await parseMarkdown(raw);
    expect(result.html).toContain('<table');
    expect(result.html).toContain('<td');
  });

  it('syntax-highlights code blocks', async () => {
    const raw = [
      '---',
      'title: Code',
      'slug: code',
      'status: draft',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      '---',
      '',
      '```typescript',
      'const x: number = 42;',
      '```',
    ].join('\n');

    const result = await parseMarkdown(raw);
    // rehype-pretty-code wraps code in <pre> with data-language attribute
    expect(result.html).toContain('data-language="typescript"');
    expect(result.html).toContain('42');
  });

  it('handles empty content with frontmatter only', async () => {
    const raw = [
      '---',
      'title: Empty',
      'slug: empty',
      'status: draft',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      '---',
    ].join('\n');

    const result = await parseMarkdown(raw);
    expect(result.frontmatter.title).toBe('Empty');
    expect(result.html.trim()).toBe('');
  });

  it('renders inline code', async () => {
    const raw = [
      '---',
      'title: Inline',
      'slug: inline',
      'status: draft',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      '---',
      '',
      'Use `console.log()` to debug.',
    ].join('\n');

    const result = await parseMarkdown(raw);
    expect(result.html).toContain('<code');
    expect(result.html).toContain('console.log()');
  });

  it('renders links', async () => {
    const raw = [
      '---',
      'title: Links',
      'slug: links',
      'status: draft',
      'createdAt: "2026-03-18T00:00:00.000Z"',
      'updatedAt: "2026-03-18T00:00:00.000Z"',
      '---',
      '',
      'Visit [Example](https://example.com).',
    ].join('\n');

    const result = await parseMarkdown(raw);
    expect(result.html).toContain('<a');
    expect(result.html).toContain('href="https://example.com"');
    expect(result.html).toContain('Example');
  });
});
