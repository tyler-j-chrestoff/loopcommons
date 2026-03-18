/**
 * Blog tools — 8 chat-invocable tools for blog CRUD operations.
 *
 * blog-05: Each tool delegates to BlogStore and returns JSON.stringify'd results.
 * Tools are created via factory so route.ts can pass the correct data directory.
 */

import { defineTool } from '@loopcommons/llm';
import type { ToolDefinition } from '@loopcommons/llm';
import { z } from 'zod';
import { createBlogStore } from '../lib/blog/store';

// ---------------------------------------------------------------------------
// Slug generation helper
// ---------------------------------------------------------------------------

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createBlogTools(config: { dataDir: string }): ToolDefinition<any>[] {
  const store = createBlogStore(config);

  const listPosts = defineTool({
    name: 'list_posts',
    description: 'List published blog posts. Returns summaries (no content) sorted by most recent first.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of posts to return'),
      offset: z.number().optional().describe('Number of posts to skip'),
    }),
    execute: async ({ limit, offset }) => {
      const posts = await store.listPublished();
      const sliced = posts.slice(offset ?? 0, limit ? (offset ?? 0) + limit : undefined);
      return JSON.stringify({ posts: sliced });
    },
  });

  const readPost = defineTool({
    name: 'read_post',
    description: 'Read a blog post by slug. Returns the full post content including markdown body.',
    parameters: z.object({
      slug: z.string().describe('The URL slug of the post to read'),
    }),
    execute: async ({ slug }) => {
      try {
        const post = await store.readPost(slug);
        if (!post) return JSON.stringify({ error: `Post not found: "${slug}"` });
        return JSON.stringify({ post });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const createDraft = defineTool({
    name: 'create_draft',
    description: 'Create a new blog post draft. Requires title and content. Tags are optional.',
    parameters: z.object({
      title: z.string().describe('The post title'),
      content: z.string().describe('The markdown content of the post'),
      tags: z.array(z.string()).optional().describe('Tags for categorization'),
      slug: z.string().optional().describe('URL slug. Auto-generated from title if not provided.'),
    }),
    execute: async ({ title, content, tags, slug }) => {
      try {
        const finalSlug = slug ?? slugify(title);
        const post = await store.createDraft(finalSlug, title, content, tags);
        return JSON.stringify({ post });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const editPost = defineTool({
    name: 'edit_post',
    description: 'Edit an existing blog post. Can update title, content, and/or tags.',
    parameters: z.object({
      slug: z.string().describe('The slug of the post to edit'),
      title: z.string().optional().describe('New title'),
      content: z.string().optional().describe('New markdown content'),
      tags: z.array(z.string()).optional().describe('New tags'),
    }),
    execute: async ({ slug, title, content, tags }) => {
      try {
        const post = await store.updatePost(slug, { title, content, tags });
        return JSON.stringify({ post });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const publishPost = defineTool({
    name: 'publish_post',
    description: 'Publish a draft blog post, making it publicly visible on the blog.',
    parameters: z.object({
      slug: z.string().describe('The slug of the draft to publish'),
    }),
    execute: async ({ slug }) => {
      try {
        const post = await store.publishPost(slug);
        return JSON.stringify({ post });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const unpublishPost = defineTool({
    name: 'unpublish_post',
    description: 'Unpublish a blog post, moving it back to drafts.',
    parameters: z.object({
      slug: z.string().describe('The slug of the post to unpublish'),
    }),
    execute: async ({ slug }) => {
      try {
        const post = await store.unpublishPost(slug);
        return JSON.stringify({ post });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const deletePost = defineTool({
    name: 'delete_post',
    description: 'Permanently delete a blog post (draft or published).',
    parameters: z.object({
      slug: z.string().describe('The slug of the post to delete'),
    }),
    execute: async ({ slug }) => {
      try {
        await store.deletePost(slug);
        return JSON.stringify({ deleted: true, slug });
      } catch (err: any) {
        return JSON.stringify({ error: err.message });
      }
    },
  });

  const listDrafts = defineTool({
    name: 'list_drafts',
    description: 'List draft blog posts. Returns summaries sorted by most recently updated.',
    parameters: z.object({
      limit: z.number().optional().describe('Maximum number of drafts to return'),
    }),
    execute: async ({ limit }) => {
      const drafts = await store.listDrafts();
      const sliced = limit ? drafts.slice(0, limit) : drafts;
      return JSON.stringify({ drafts: sliced });
    },
  });

  return [listPosts, readPost, createDraft, editPost, publishPost, unpublishPost, deletePost, listDrafts];
}
