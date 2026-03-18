# Milestone: Blog Tools

**Status**: planned

## Summary

Add a blog to Loop Commons where Tyler publishes through the same chat agent every visitor uses. The agent IS the CMS — same endpoint, same amygdala, but the tools available depend on auth. This creates the first real security boundary: write tools that change published state on a live website, defended by the amygdala + deterministic auth gating.

**Research value**: Every blog-related interaction generates training data where the ground truth label comes from two independent systems (amygdala reasoning + deterministic auth check). "Publish this post" is legitimate from Tyler and adversarial from an attacker — the amygdala has to reason about the same tool under different threat contexts. This is the labeled data that doesn't exist in the open-source ecosystem.

## Architecture

```
Security layers (defense in depth):
  Layer 0: Auth check (deterministic — is this session admin?)
  Layer 1: Input sanitization (existing — Unicode, role-spoofing)
  Layer 2: Amygdala (intent + threat — catches social engineering)
  Layer 3: Orchestrator (auth-gated tool scoping — blog-writer only if admin)
  Layer 4: Tool implementation (slug validation, path traversal prevention)

Storage:
  data/blog/
    drafts/{slug}.md      # YAML frontmatter + markdown body
    published/{slug}.md   # Same format, moved on publish

Tools:
  Public:  list_posts, read_post (published only)
  Admin:   create_draft, edit_post, publish_post, unpublish_post, delete_post, list_drafts

Subagents:
  blog-reader: list_posts, read_post — any visitor
  blog-writer: all 8 blog tools — admin only

Frontend:
  /blog         — published post listing (SSR, public)
  /blog/[slug]  — individual post (markdown → HTML, syntax highlighting)

Rendering:
  unified + remark-parse + remark-gfm + remark-rehype + rehype-stringify
  + rehype-pretty-code (Shiki, dark theme) + gray-matter (frontmatter)
  Server Components only — no client JS for blog pages
```

## Verification Gate

- [x] Blog storage: create, read, update, delete markdown files with frontmatter
- [x] 8 blog tools implemented with input validation and path traversal prevention
- [x] `blog` intent in amygdala classification
- [x] blog-reader subagent (public) and blog-writer subagent (admin-only)
- [x] Auth-gated routing: orchestrator checks isAdmin before granting write tools
- [ ] /blog listing page with published posts
- [ ] /blog/[slug] renders markdown with syntax highlighting
- [ ] Tyler can publish a post via chat (end-to-end)
- [ ] Anonymous user cannot publish via chat (end-to-end)
- [ ] Red-team tests: authority impersonation, social engineering targeting blog write tools
- [ ] Blog events flow through pipeline to training data export
- [ ] Eval fixtures include blog-specific scenarios (read vs write, admin vs anon)

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [blog-storage](stories/blog-storage.md) | Tyler (developer) | Blog data model, file persistence module, 8 tool implementations |
| [blog-routing](stories/blog-routing.md) | Tyler (researcher) | Blog intent, subagent configs, auth-gated orchestrator routing |
| [blog-frontend](stories/blog-frontend.md) | Visitor | /blog listing, /blog/[slug] post pages, markdown rendering |
| [blog-security](stories/blog-security.md) | Tyler (researcher) | Red-team tests, eval fixtures, pipeline integration, training data |
