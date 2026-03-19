/**
 * Blog data access functions for server components.
 *
 * blog-16: Read-only functions for fetching published posts and rendering markdown.
 * Uses BlogStore for file access + renderMarkdown for HTML rendering.
 */

import { createBlogStore } from './store';
import { renderMarkdown } from './markdown';
import type { BlogFrontmatter } from '@loopcommons/llm';
import type { BlogPostSummary } from '@loopcommons/llm';

export type RenderedPost = {
  frontmatter: BlogFrontmatter;
  html: string;
};

const DEFAULT_DATA_DIR = process.env.BLOG_DATA_DIR ?? 'data/blog';

export async function getPublishedPosts(dataDir?: string): Promise<BlogPostSummary[]> {
  const store = createBlogStore({ dataDir: dataDir ?? DEFAULT_DATA_DIR });
  return store.listPublished();
}

export async function getPost(
  slug: string,
  dataDir?: string,
): Promise<RenderedPost | null> {
  const store = createBlogStore({ dataDir: dataDir ?? DEFAULT_DATA_DIR });
  const post = await store.readPost(slug);
  if (!post || post.status !== 'published') return null;

  const html = await renderMarkdown(post.content);
  const frontmatter: BlogFrontmatter = {
    title: post.title,
    slug: post.slug,
    status: post.status,
    author: post.author,
    tags: post.tags,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    excerpt: post.excerpt,
    publishedAt: post.publishedAt,
  };

  return { frontmatter, html };
}
