# Story: Blog Routing + Auth Gating

> As **Tyler (researcher)**, I want the amygdala to classify blog-related intents and the orchestrator to gate write tools behind admin auth, so that the same agent safely handles both public blog reading and authenticated publishing — generating dual-labeled training data at every interaction.

## Acceptance Criteria

- `blog` added as an AmygdalaIntent value
- Amygdala system prompt updated to describe blog intent and distinguish read vs write requests
- blog-reader subagent config: `list_posts`, `read_post` tools, any user
- blog-writer subagent config: all 8 blog tools, admin only
- Orchestrator accepts `isAdmin` flag in input, uses it to select blog-reader vs blog-writer
- route.ts passes `isAdmin` (from NextAuth session) to orchestrator
- Blog tools registered in route.ts tool registry
- Non-admin users NEVER get write tools, regardless of amygdala classification
- Trace events capture auth-gating decisions for training data

## Tasks

```jsonl
{"id":"blog-08","story":"blog-routing","description":"Add 'blog' to AmygdalaIntent union type in packages/llm/src/amygdala/types.ts. Update the amygdala system prompt in packages/llm/src/amygdala/index.ts: add blog intent description ('asking to read, write, publish, or manage blog posts'), add guidance distinguishing read requests (any user) from write requests (admin context needed), add note that write requests from non-admin sessions are NOT adversarial — they're legitimate requests that will be handled with read-only tools.","depends_on":[],"requires":"","status":"pending"}
{"id":"blog-09","story":"blog-routing","description":"Add blog-reader and blog-writer subagent configs to packages/llm/src/subagent/registry.ts. blog-reader: id='blog-reader', toolAllowlist=['list_posts','read_post'], system prompt about helping visitors explore published blog content, maxHistoryMessages=5. blog-writer: id='blog-writer', toolAllowlist=['list_posts','read_post','create_draft','edit_post','publish_post','unpublish_post','delete_post','list_drafts'], system prompt about helping Tyler manage blog content, maxHistoryMessages=10.","depends_on":["blog-08"],"requires":"","status":"pending"}
{"id":"blog-10","story":"blog-routing","description":"Update orchestrator to accept isAdmin flag. Add isAdmin: boolean to OrchestratorInput type in packages/llm/src/orchestrator/types.ts. In selectSubagent(), when intent='blog': if isAdmin → blog-writer, else → blog-reader. Emit orchestrator:route trace event with authGated: true/false field indicating whether auth affected routing. This is the defense-in-depth layer — even if amygdala is fooled, non-admin never gets write tools.","depends_on":["blog-09"],"requires":"","status":"pending"}
{"id":"blog-11","story":"blog-routing","description":"Update the subagent registry mapping. Currently intent→subagent is a direct map. With blog, the mapping becomes context-dependent (blog→blog-reader or blog-writer based on auth). Refactor registry.get() to accept optional context: {isAdmin?: boolean}. Default behavior unchanged for all existing intents. Only 'blog' uses the context.","depends_on":["blog-10"],"requires":"","status":"pending"}
{"id":"blog-12","story":"blog-routing","description":"Wire blog tools and auth into route.ts in packages/web/src/app/api/chat/route.ts. Import createBlogTools, instantiate with BLOG_DATA_DIR. Add blog tools to the tool registry. Extract isAdmin from NextAuth session (session.user role or username match). Pass isAdmin to orchestrator input. Ensure blog tools are registered alongside existing get_resume and get_project tools.","depends_on":["blog-07","blog-10"],"requires":"","status":"pending"}
{"id":"blog-13","story":"blog-routing","description":"Write routing tests (TDD). Test: intent=blog with isAdmin=true → blog-writer subagent with all 8 tools. intent=blog with isAdmin=false → blog-reader subagent with 2 tools only. Threat override at >=0.8 still forces refusal regardless of blog intent. Auth-gating trace event emitted. Existing intent routing unchanged (resume, project, etc. ignore isAdmin). Non-admin never gets create_draft, edit_post, publish_post, unpublish_post, delete_post, or list_drafts.","depends_on":["blog-11"],"requires":"","status":"pending"}
```
