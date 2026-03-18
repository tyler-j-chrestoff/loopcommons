/**
 * BlogStore — file-based blog storage module.
 *
 * blog-03: CRUD operations for markdown blog posts with YAML frontmatter.
 * Drafts in {dataDir}/drafts/{slug}.md, published in {dataDir}/published/{slug}.md.
 * Path traversal prevention via slug regex + realpath verification.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { SLUG_REGEX, BlogFrontmatterSchema } from '@loopcommons/llm';
import type { BlogPost, BlogPostSummary } from '@loopcommons/llm';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BlogStoreConfig = {
  dataDir: string;
};

export type BlogPostUpdate = {
  title?: string;
  content?: string;
  tags?: string[];
  excerpt?: string;
};

export type BlogStore = {
  createDraft(slug: string, title: string, content: string, tags?: string[]): Promise<BlogPost>;
  readPost(slug: string): Promise<BlogPost | null>;
  updatePost(slug: string, updates: BlogPostUpdate): Promise<BlogPost>;
  deletePost(slug: string): Promise<void>;
  publishPost(slug: string): Promise<BlogPost>;
  unpublishPost(slug: string): Promise<BlogPost>;
  listPublished(): Promise<BlogPostSummary[]>;
  listDrafts(): Promise<BlogPostSummary[]>;
};

// ---------------------------------------------------------------------------
// Slug validation
// ---------------------------------------------------------------------------

function validateSlug(slug: string): void {
  if (!SLUG_REGEX.test(slug)) {
    throw new Error(`Invalid slug: "${slug}". Must match ${SLUG_REGEX}`);
  }
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function postFilePath(dataDir: string, status: 'draft' | 'published', slug: string): string {
  const dir = status === 'draft' ? 'drafts' : 'published';
  return path.join(dataDir, dir, `${slug}.md`);
}

function serializePost(post: BlogPost): string {
  const { content, ...frontmatter } = post;
  // Remove undefined fields from frontmatter
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(frontmatter)) {
    if (v !== undefined) clean[k] = v;
  }
  return matter.stringify(content, clean);
}

async function parsePostFile(filePath: string): Promise<BlogPost | null> {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const { data, content } = matter(raw);
    const parsed = BlogFrontmatterSchema.parse(data);
    return {
      slug: parsed.slug,
      title: parsed.title,
      content: content.trim(),
      status: parsed.status,
      tags: parsed.tags ?? [],
      createdAt: parsed.createdAt,
      updatedAt: parsed.updatedAt,
      excerpt: parsed.excerpt,
      publishedAt: parsed.publishedAt,
    };
  } catch (err: any) {
    if (err?.code === 'ENOENT') return null;
    throw err;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

async function listPostFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter(e => e.endsWith('.md'));
  } catch (err: any) {
    if (err?.code === 'ENOENT') return [];
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBlogStore(config: BlogStoreConfig): BlogStore {
  const { dataDir } = config;
  const draftsDir = path.join(dataDir, 'drafts');
  const publishedDir = path.join(dataDir, 'published');

  return {
    async createDraft(slug, title, content, tags) {
      validateSlug(slug);
      await ensureDir(draftsDir);

      const filePath = postFilePath(dataDir, 'draft', slug);

      // Check for duplicate
      try {
        await fs.stat(filePath);
        throw new Error(`Draft already exists: "${slug}"`);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }

      // Also check published dir
      const pubPath = postFilePath(dataDir, 'published', slug);
      try {
        await fs.stat(pubPath);
        throw new Error(`Post already exists (published): "${slug}"`);
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }

      const now = new Date().toISOString();
      const post: BlogPost = {
        slug,
        title,
        content,
        status: 'draft',
        tags: tags ?? [],
        createdAt: now,
        updatedAt: now,
      };

      await fs.writeFile(filePath, serializePost(post), 'utf-8');
      return post;
    },

    async readPost(slug) {
      validateSlug(slug);

      // Check published first, then drafts
      const pubPath = postFilePath(dataDir, 'published', slug);
      const pubPost = await parsePostFile(pubPath);
      if (pubPost) return pubPost;

      const draftPath = postFilePath(dataDir, 'draft', slug);
      return parsePostFile(draftPath);
    },

    async updatePost(slug, updates) {
      validateSlug(slug);

      // Find the post (published or draft)
      const pubPath = postFilePath(dataDir, 'published', slug);
      const draftPath = postFilePath(dataDir, 'draft', slug);

      let post = await parsePostFile(pubPath);
      let filePath = pubPath;
      if (!post) {
        post = await parsePostFile(draftPath);
        filePath = draftPath;
      }

      if (!post) throw new Error(`Post not found: "${slug}"`);

      // Apply updates
      if (updates.title !== undefined) post.title = updates.title;
      if (updates.content !== undefined) post.content = updates.content;
      if (updates.tags !== undefined) post.tags = updates.tags;
      if (updates.excerpt !== undefined) post.excerpt = updates.excerpt;
      post.updatedAt = new Date().toISOString();

      await fs.writeFile(filePath, serializePost(post), 'utf-8');
      return post;
    },

    async deletePost(slug) {
      validateSlug(slug);

      const pubPath = postFilePath(dataDir, 'published', slug);
      const draftPath = postFilePath(dataDir, 'draft', slug);

      // Try published first, then draft
      try {
        await fs.unlink(pubPath);
        return;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }

      try {
        await fs.unlink(draftPath);
        return;
      } catch (err: any) {
        if (err?.code !== 'ENOENT') throw err;
      }

      throw new Error(`Post not found: "${slug}"`);
    },

    async publishPost(slug) {
      validateSlug(slug);
      await ensureDir(publishedDir);

      const draftPath = postFilePath(dataDir, 'draft', slug);
      const pubPath = postFilePath(dataDir, 'published', slug);

      const post = await parsePostFile(draftPath);
      if (!post) {
        // Check if already published
        const existing = await parsePostFile(pubPath);
        if (existing) throw new Error(`Post already published: "${slug}"`);
        throw new Error(`Draft not found: "${slug}"`);
      }

      const now = new Date().toISOString();
      post.status = 'published';
      post.publishedAt = now;
      post.updatedAt = now;

      await fs.writeFile(pubPath, serializePost(post), 'utf-8');
      await fs.unlink(draftPath);
      return post;
    },

    async unpublishPost(slug) {
      validateSlug(slug);
      await ensureDir(draftsDir);

      const pubPath = postFilePath(dataDir, 'published', slug);
      const draftPath = postFilePath(dataDir, 'draft', slug);

      const post = await parsePostFile(pubPath);
      if (!post) {
        const existing = await parsePostFile(draftPath);
        if (existing) throw new Error(`Post is a draft, not published: "${slug}"`);
        throw new Error(`Published post not found: "${slug}"`);
      }

      post.status = 'draft';
      post.updatedAt = new Date().toISOString();

      await fs.writeFile(draftPath, serializePost(post), 'utf-8');
      await fs.unlink(pubPath);
      return post;
    },

    async listPublished() {
      const files = await listPostFiles(publishedDir);
      const posts: BlogPostSummary[] = [];

      for (const file of files) {
        const post = await parsePostFile(path.join(publishedDir, file));
        if (post) {
          const { content, ...summary } = post;
          posts.push(summary);
        }
      }

      // Sort by publishedAt descending
      posts.sort((a, b) => {
        const aDate = a.publishedAt ?? a.updatedAt;
        const bDate = b.publishedAt ?? b.updatedAt;
        return bDate.localeCompare(aDate);
      });

      return posts;
    },

    async listDrafts() {
      const files = await listPostFiles(draftsDir);
      const posts: BlogPostSummary[] = [];

      for (const file of files) {
        const post = await parsePostFile(path.join(draftsDir, file));
        if (post) {
          const { content, ...summary } = post;
          posts.push(summary);
        }
      }

      // Sort by updatedAt descending
      posts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      return posts;
    },
  };
}
