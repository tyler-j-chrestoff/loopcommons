# Blog Storage Design Notes

Research findings from blog-01 (2026-03-18).

## Frontmatter Schema

YAML frontmatter (standard across Jekyll, Hugo, Astro, Next.js). Fields:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| title | string | yes | Display title |
| slug | string | yes | URL-safe identifier, matches filename |
| tags | string[] | no | Categorization |
| status | `draft` \| `published` | yes | Controls visibility |
| excerpt | string | no | Short summary for listings |
| createdAt | ISO 8601 | yes | Set once on creation |
| updatedAt | ISO 8601 | yes | Bumped on every edit |
| publishedAt | ISO 8601 | no | Set on first publish |

## Package Stack

All current and actively maintained:

| Package | Version | Notes |
|---------|---------|-------|
| gray-matter | 4.0.3 | Stable/mature, 39M+ weekly downloads |
| unified | 11.0.5 | Core processor |
| remark-parse | 11.0.0 | Markdown parser |
| remark-gfm | 4.0.1 | GFM tables, strikethrough, task lists |
| remark-rehype | 11.1.2 | Markdown AST → HTML AST bridge |
| rehype-stringify | 10.0.1 | HTML serializer |
| rehype-pretty-code | 0.14.3 | Shiki syntax highlighting, pre-1.0 but active |

All ESM-native. gray-matter uses js-yaml in safe mode (no deserialization attacks).

## Slug Validation

Regex: `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`

Enforces: lowercase alphanumeric, hyphen separators, no leading/trailing/consecutive hyphens, non-empty. Rejects path traversal sequences by construction.

## Security Mitigations

1. **Path traversal**: Slug regex rejects `../` etc. Additionally: `path.join(root, slug + '.md')` then `fs.realpath()` and verify `resolvedPath.startsWith(resolvedRoot)`.
2. **Symlink following**: The realpath check catches symlinks pointing outside the root.
3. **TOCTOU race conditions**: Low risk for single-admin blog. Use `fs.promises.open()` on fd immediately after validation for defense in depth.
4. **Large files**: Enforce max file size on reads (1MB).
5. **Content injection**: Admin-only writes. rehype-sanitize available if user-contributed content added later.
6. **Filename enumeration**: Return same 404 for not-found and forbidden.
