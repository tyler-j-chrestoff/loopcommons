# Story: Blog Storage + Tools

> As **Tyler (developer)**, I want a file-based blog storage module and 8 chat-invocable tools so that the agent can create, read, update, publish, and delete blog posts. The storage uses markdown files with YAML frontmatter on the Railway persistent volume, consistent with the session JSONL pattern.

## Acceptance Criteria

- Blog posts stored as markdown files with YAML frontmatter (title, slug, tags, status, createdAt, updatedAt, publishedAt, excerpt)
- Drafts in `data/blog/drafts/{slug}.md`, published in `data/blog/published/{slug}.md`
- `BLOG_DATA_DIR` env var overrides default path (same pattern as `SESSION_DATA_DIR`)
- 8 tools registered in the tool registry with Zod-validated parameters
- All tools validate slug format (alphanumeric + hyphens, no path traversal)
- Tools return structured JSON (not raw markdown) for agent consumption
- Full test coverage via TDD

## Tasks

```jsonl
{"id":"blog-01","story":"blog-storage","description":"Research task: confirm markdown blog file conventions, frontmatter schema best practices, and slug validation patterns. Verify gray-matter + unified/remark/rehype stack is current. Document any security considerations for file-based blog storage (path traversal, symlink following). Brief notes in planning/milestones/blog-tools/designs/storage-design.md.","depends_on":[],"requires":"","status":"pending"}
{"id":"blog-02","story":"blog-storage","description":"Define blog types in packages/llm/src/blog/types.ts. BlogPost type (slug, title, content, tags, status: draft|published, createdAt, updatedAt, publishedAt, excerpt). BlogPostSummary type (same without content — for list operations). BlogFrontmatter Zod schema for parsing/validating frontmatter from gray-matter.","depends_on":["blog-01"],"requires":"","status":"pending"}
{"id":"blog-03","story":"blog-storage","description":"Implement BlogStore module in packages/web/src/lib/blog/store.ts. File-based CRUD: createDraft(slug, title, content, tags) writes to drafts dir, readPost(slug, status?) reads and parses with gray-matter, updatePost(slug, updates) rewrites file preserving createdAt, deletePost(slug) removes file, publishPost(slug) moves draft→published and sets publishedAt, unpublishPost(slug) moves published→draft, listPublished() returns summaries sorted by publishedAt desc, listDrafts() returns summaries sorted by updatedAt desc. Reads BLOG_DATA_DIR env var. Slug validation: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ — reject anything else. Path traversal prevention: resolve and verify path stays within blog dir.","depends_on":["blog-02"],"requires":"","status":"pending"}
{"id":"blog-04","story":"blog-storage","description":"Write BlogStore unit tests (TDD — write tests first). Test: create draft writes file with correct frontmatter, read returns parsed post, update preserves createdAt and bumps updatedAt, delete removes file, publish moves file and sets publishedAt, unpublish moves back, list returns sorted summaries, slug validation rejects '../etc/passwd' and 'foo/bar' and '', path traversal blocked, reading nonexistent slug returns null, BLOG_DATA_DIR override works. Use temp directories.","depends_on":["blog-02"],"requires":"","status":"pending"}
{"id":"blog-05","story":"blog-storage","description":"Define 8 blog tools using defineTool in packages/llm/src/blog/tools.ts. Each tool has Zod parameters, description, and execute function that delegates to BlogStore. Tools: list_posts(limit?, offset?), read_post(slug), create_draft(title, content, tags?), edit_post(slug, title?, content?, tags?), publish_post(slug), unpublish_post(slug), delete_post(slug), list_drafts(limit?). Execute functions return JSON.stringify'd results. Import and register all 8 in the tool registry.","depends_on":["blog-03"],"requires":"","status":"pending"}
{"id":"blog-06","story":"blog-storage","description":"Write tool integration tests (TDD). Test each tool's execute function: list_posts returns published only, read_post returns content for published slug, create_draft creates file, edit_post updates content, publish_post moves to published, unpublish_post moves to drafts, delete_post removes, list_drafts returns drafts only. Test error cases: read_post with invalid slug returns error JSON, edit_post on nonexistent returns error, publish already-published returns error. Use temp directories.","depends_on":["blog-05"],"requires":"","status":"pending"}
{"id":"blog-07","story":"blog-storage","description":"Add blog tool exports to packages/llm/src/index.ts. Export blog types, tool definitions, and a createBlogTools(config: {dataDir: string}) factory that returns the 8 tool definitions pre-configured with a BlogStore instance. The factory pattern lets route.ts create tools with the correct data directory from env vars.","depends_on":["blog-05"],"requires":"","status":"pending"}
```
