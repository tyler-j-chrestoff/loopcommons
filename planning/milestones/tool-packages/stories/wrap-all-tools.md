# Story: Wrap All Tools as ToolPackages with Enriched Metadata

**Persona**: As the agent architect, I want every tool exposed through ToolPackage with intent/sideEffect metadata, so derived-prompts can auto-generate subagent configs.

**Status**: planned

**Acceptance criteria**:
- ToolPackage metadata type extended with `intent`, `sideEffects`, `authRequired`
- `createResumePackage()`, `createProjectPackage()`, `createBlogToolPackage()` factories
- Memory packages updated with new metadata fields
- route.ts assembles tools exclusively from ToolPackage instances
- All packages pass contract test suite

## Tasks

```jsonl
{"id":"tp-01","title":"Extend ToolPackage metadata type + contract test update","type":"implementation","status":"planned","description":"Add intent: string[], sideEffects: boolean, authRequired?: boolean to ToolPackage metadata in packages/llm/src/tool/index.ts. Update contract tests in packages/llm/test/tool-package.test.ts to assert new fields. TDD: failing test first.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"tp-02","title":"Wrap resume tool as ToolPackage","type":"implementation","status":"planned","description":"Create createResumePackage() factory in packages/web/src/tools/resume.ts. Returns ToolPackage with tools: [resumeTool], formatContext: () => '', metadata: { name: 'resume', capabilities: ['resume-lookup'], intent: ['resume'], sideEffects: false }. TDD.","estimate":"20min","deps":["tp-01"],"prereqs":[]}
{"id":"tp-03","title":"Wrap project tool as ToolPackage","type":"implementation","status":"planned","description":"Create createProjectPackage() factory in packages/web/src/tools/project.ts. Returns ToolPackage with tools: [projectTool], formatContext: () => '', metadata: { name: 'project', capabilities: ['project-info'], intent: ['project'], sideEffects: false }. TDD.","estimate":"20min","deps":["tp-01"],"prereqs":[]}
{"id":"tp-04","title":"Wrap blog tools as ToolPackage (reader + writer variants)","type":"implementation","status":"planned","description":"Create createBlogToolPackage({ dataDir, variant: 'reader' | 'writer' }) in packages/web/src/tools/blog.ts. Reader variant: list_posts + read_post only, sideEffects: false. Writer variant: all 8 tools, sideEffects: true, authRequired: true. TDD.","estimate":"45min","deps":["tp-01"],"prereqs":[]}
{"id":"tp-05","title":"Update memory packages with enriched metadata","type":"implementation","status":"planned","description":"Add intent: ['memory-recall', 'memory-remember'], sideEffects: true to keyword-package.ts and embedding-package.ts metadata. TDD.","estimate":"20min","deps":["tp-01"],"prereqs":[]}
{"id":"tp-06","title":"Update route.ts to assemble from ToolPackages","type":"implementation","status":"planned","description":"Refactor route.ts to create all ToolPackage instances, then build toolRegistry from [...resumePkg.tools, ...projectPkg.tools, ...blogPkg.tools, ...memoryPkg.tools]. Remove direct tool imports. Memory context still uses memoryPkg.formatContext().","estimate":"30min","deps":["tp-02","tp-03","tp-04","tp-05"],"prereqs":[]}
{"id":"tp-07","title":"Contract tests for all new packages","type":"test","status":"planned","description":"Run runToolPackageContractTests() against resume, project, blog-reader, blog-writer packages in packages/llm/test/tool-package.test.ts (or packages/web test). Verify enriched metadata fields.","estimate":"30min","deps":["tp-02","tp-03","tp-04"],"prereqs":[]}
{"id":"tp-08","title":"Full regression run","type":"test","status":"planned","description":"Run full test suite across all packages (npm test in root). Verify zero regressions. Fix any failures.","estimate":"15min","deps":["tp-06","tp-07"],"prereqs":[]}
```
