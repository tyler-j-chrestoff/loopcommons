# Milestone: Tool Packages

**Status**: done
**Sessions**: 1
**Stories**: 1
**Prerequisite**: memory-packages (completed)

Wrap all tools as ToolPackages with enriched metadata. Prove the pattern generalizes beyond memory.

## Key Decisions

- Blog tools stay in `packages/web` (one consumer, no extraction needed). Get ToolPackage wrapping in-place via `createBlogToolPackage({ dataDir, variant: 'reader' | 'writer' })`.
- Resume and project each get their own small `createXxxPackage()` factory (12-15 lines each). No shared helper.
- ToolPackage metadata extended with: `intent: string[]`, `sideEffects: boolean`, `authRequired?: boolean`. These feed derived-prompts in the next milestone.
- Subagent registry keeps string-based tool allowlists (no ToolPackage references). The registry is declarative; the route assembles packages.

## Verification Gate

- [x] ToolPackage metadata type extended with `intent`, `sideEffects`, `authRequired`
- [x] `createResumePackage()`, `createProjectPackage()`, `createBlogToolPackage()` factories exist
- [x] Memory packages updated with new metadata fields
- [x] route.ts assembles tools exclusively from ToolPackage instances
- [x] All packages pass contract test suite
- [x] Full regression: all existing tests pass

## Files

`packages/llm/src/tool/index.ts`, `packages/web/src/tools/{resume,project,blog}.ts`, `packages/web/src/app/api/chat/route.ts`, `packages/memory/src/{keyword,embedding}-package.ts`
