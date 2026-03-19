/**
 * Markdown rendering utility for blog posts.
 *
 * blog-15: Parses frontmatter and renders markdown to HTML with syntax highlighting.
 * Uses unified pipeline: remark-parse → remark-gfm → remark-rehype → rehype-pretty-code → rehype-stringify.
 */

import matter from 'gray-matter';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import rehypePrettyCode from 'rehype-pretty-code';
import { BlogFrontmatterSchema } from '@loopcommons/llm';
import type { BlogFrontmatter } from '@loopcommons/llm';

export type ParsedMarkdown = {
  frontmatter: BlogFrontmatter;
  html: string;
};

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypePrettyCode, { theme: 'everforest-light' })
  .use(rehypeStringify);

export async function parseMarkdown(raw: string): Promise<ParsedMarkdown> {
  const { data, content } = matter(raw);
  const frontmatter = BlogFrontmatterSchema.parse(data);
  const html = await renderMarkdown(content);
  return { frontmatter, html };
}

export async function renderMarkdown(content: string): Promise<string> {
  const result = await processor.process(content);
  return String(result);
}
