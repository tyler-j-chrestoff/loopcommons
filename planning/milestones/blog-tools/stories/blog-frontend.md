# Story: Blog Frontend

> As a **visitor**, I want to browse Tyler's published blog posts on `/blog` and read individual posts with syntax-highlighted code blocks, so that I can learn from his research and engineering writing.

## Acceptance Criteria

- `/blog` page lists published posts (title, date, excerpt, tags) sorted by date descending
- `/blog/[slug]` page renders full markdown with syntax highlighting (Shiki, dark theme)
- Consistent with existing dark theme and Tailwind styling
- Server-side rendered (no client JS for blog pages)
- SEO: proper meta tags, Open Graph, structured data
- 404 page for nonexistent slugs
- Blog navigation accessible from main site

## Tasks

```jsonl
{"id":"blog-14","story":"blog-frontend","description":"Research task: verify unified/remark/rehype + rehype-pretty-code + gray-matter stack. Install dependencies: npm install unified remark-parse remark-gfm remark-rehype rehype-stringify rehype-pretty-code gray-matter in packages/web. Confirm Shiki theme options compatible with existing dark theme. Brief notes on any integration issues.","depends_on":[],"requires":"","status":"pending"}
{"id":"blog-15","story":"blog-frontend","description":"Implement markdown rendering utility in packages/web/src/lib/blog/markdown.ts. Function parseMarkdown(raw: string) → {frontmatter: BlogFrontmatter, html: string}. Uses gray-matter for frontmatter, unified pipeline (remark-parse → remark-gfm → remark-rehype → rehype-pretty-code → rehype-stringify) for HTML. Shiki theme: 'one-dark-pro' or similar dark theme. Export as server-only module.","depends_on":["blog-14"],"requires":"","status":"pending"}
{"id":"blog-16","story":"blog-frontend","description":"Implement blog data access functions in packages/web/src/lib/blog/data.ts. Functions: getPublishedPosts() → BlogPostSummary[] (reads published dir, parses frontmatter only, sorts by publishedAt desc), getPost(slug: string) → {frontmatter, html} | null (reads and renders full post). Uses BlogStore for file access + parseMarkdown for rendering. Server-only.","depends_on":["blog-03","blog-15"],"requires":"","status":"pending"}
{"id":"blog-17","story":"blog-frontend","description":"Build /blog listing page at packages/web/src/app/blog/page.tsx. Server Component. Calls getPublishedPosts(). Renders: page title, list of post cards (title as link, date, excerpt, tags as badges). Empty state: 'No posts yet.' Styled with Tailwind, consistent with existing dark theme. Responsive.","depends_on":["blog-16"],"requires":"","status":"pending"}
{"id":"blog-18","story":"blog-frontend","description":"Build /blog/[slug] post page at packages/web/src/app/blog/[slug]/page.tsx. Server Component. Calls getPost(slug). Renders: title, date, tags, rendered HTML content (via dangerouslySetInnerHTML). 404 via notFound() for missing slugs. Add prose styling for rendered markdown (tailwind typography plugin or custom styles). Back link to /blog.","depends_on":["blog-16"],"requires":"","status":"pending"}
{"id":"blog-19","story":"blog-frontend","description":"Add blog navigation. Add 'Blog' link to the main site navigation/header. Add metadata: page titles, descriptions. Open Graph tags for post pages (title, description, type=article). Favicon and site-level meta already exist — just extend for blog.","depends_on":["blog-17","blog-18"],"requires":"","status":"pending"}
{"id":"blog-20","story":"blog-frontend","description":"Write frontend tests (TDD). Test: /blog page renders post list from mock data, /blog/[slug] renders markdown content, 404 for unknown slug, parseMarkdown produces valid HTML from markdown input, frontmatter is correctly parsed, code blocks get syntax highlighting classes, empty blog shows empty state message.","depends_on":["blog-17","blog-18"],"requires":"","status":"pending"}
```
