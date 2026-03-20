# Session 33: Derived Prompts — What We Built

## The Thesis in Action

> An agent's identity is its tool composition, not its prompt.

Session 32 proved tools carry enough metadata to describe themselves (ToolPackages with `intent`, `sideEffects`, `authRequired`). This session proves the next claim: **system prompts can be generated from tool composition**.

## What Changed

### Before: Hand-Written Prompts Drift from Reality

Subagent system prompts were fully hand-written. The blog-writer prompt said *"You have full access to create, edit, publish, unpublish, and delete blog posts"* — a capability description that could drift if tools were added or removed. The blog-reader prompt said *"If the visitor asks to write, edit, or publish a post, explain that write operations require authentication"* — a boundary description that duplicated the routing logic.

```
// BEFORE: blog-writer subagent prompt (hand-written capabilities)
systemPrompt:
  'You help Tyler manage blog content on Loop Commons. You have full access
   to create, edit, publish, unpublish, and delete blog posts. Use drafts
   for work-in-progress...'
```

### After: Prompts Derived from Tool Metadata

Three pure functions now generate prompt sections from ToolPackage metadata:

**`deriveCapabilities(tools, packages)`** — generates a markdown list of what the subagent *can* do:
```
## Your Tools
- **list_posts**: List published blog posts (modifies state, auth required)
- **create_draft**: Create a new blog post draft (modifies state, auth required)
- **memory_recall**: Recall information from persistent memory (read-only)
```

**`deriveBoundaries(allowlist, allToolNames)`** — generates what the subagent *cannot* do:
```
## Boundaries
You do not have access to: create_draft, delete_post, publish_post.
If a user asks for something that requires these tools, let them know honestly.
```

**`buildSystemPrompt({ domainKnowledge, tools, packages, allowlist, allToolNames, annotations })`** — assembles the complete prompt:
```
[Base prompt: Loop Commons context, amygdala trust]
[Your Role: authored domain knowledge — framing, personality, constraints]
[Your Tools: derived from ToolPackage metadata — never drifts]
[Boundaries: derived from allowlist gap — always accurate]
[Context Annotations: from amygdala — conversation state flags]
```

### Subagent Prompts Trimmed to Domain Knowledge

The architect writes *what* the subagent is for. The system derives *what it can do*.

```
// AFTER: blog-writer subagent prompt (domain knowledge only)
systemPrompt:
  'You help Tyler manage blog content on Loop Commons. Use drafts
   for work-in-progress. Present results clearly — confirm what was
   done, show the post slug and status.'
```

Capability descriptions removed. Boundary descriptions removed. These are now derived at prompt-assembly time from the actual tools the subagent receives.

## The Architecture

```
                    ┌─────────────────┐
                    │  ToolPackages   │
                    │  (metadata)     │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
    deriveCapabilities  deriveBoundaries  annotations
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │ buildSystemPrompt│
                    │ (hybrid assembler)│
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
     Authored domain knowledge    Derived capabilities
     (framing, personality,       (tools, boundaries,
      constraints — static)        annotations — dynamic)
```

## Test Results

| Suite | Tests | Status |
|-------|-------|--------|
| `derive.test.ts` — unit tests for 3 pure functions | 19 | ✅ |
| `derive-equivalence.test.ts` — no information loss | 19 | ✅ |
| Full LLM package (incl. red-team, eval, calibration) | 537 | ✅ |
| Web package (excl. 1 pre-existing mock issue) | 418 | ✅ |

**38 new tests**, zero regressions across 955 existing tests.

## Files Changed

| File | Change |
|------|--------|
| `packages/llm/src/tool/derive.ts` | **NEW** — `deriveCapabilities`, `deriveBoundaries`, `buildSystemPrompt` |
| `packages/llm/test/derive.test.ts` | **NEW** — 19 unit tests |
| `packages/llm/test/derive-equivalence.test.ts` | **NEW** — 19 equivalence tests |
| `packages/llm/src/orchestrator/index.ts` | Replaced inline `buildSystemPrompt` with derived version |
| `packages/llm/src/orchestrator/types.ts` | Added `toolPackages` to `OrchestratorInput` |
| `packages/llm/src/subagent/registry.ts` | Trimmed blog prompts to domain knowledge |
| `packages/llm/src/index.ts` | Exported derive functions (dp-10 done early) |
| `packages/web/src/app/api/chat/route.ts` | Passes `toolPackages` to orchestrator |

## Why This Matters

This is the second step in proving `A(soul, tools) = system_prompt`. The equation is becoming literal:

1. **Session 32** (tool-packages): Tools carry metadata → `tools` term exists
2. **Session 33** (derived-prompts): `buildSystemPrompt(domainKnowledge, tools)` → `system_prompt` is computed
3. **Next**: Multi-interface portability — same tools, different interfaces, same identity
4. **Then**: Evolutionary selection — discover tool compositions that hand-design can't

The security subagent has zero tools → zero derived capabilities → 100% authored prompt. The blog-writer has 10 tools → rich derived capabilities + auth annotations. The prompt *is* the tool composition, projected through the architect's domain knowledge lens.
