# Story: Commit-Addressed Agent Identity

**Persona**: As the agent-arena, I need every agent instance to carry a verifiable identity derived from its tool composition, so evolution operates on attested lineages rather than bare prompts.

**Status**: done

**Acceptance criteria**:
- Commit SHA flows through AgentInvocation identity
- Derived prompt identity is a deterministic hash of commit + tool composition
- Lineage header type with parent/child/diff
- Trace and session events carry identity metadata
- buildSystemPrompt verified as deterministic (no side effects)

## Tasks

```jsonl
{"id":"al-01","title":"Verify buildSystemPrompt determinism","type":"test","status":"done","description":"Write tests proving buildSystemPrompt is a pure function: same inputs always produce same output. No Date.now(), no Math.random(), no env-dependent branches. This is a prerequisite for content-addressing — if the function isn't deterministic, hashes are meaningless.","estimate":"20min","deps":[],"prereqs":["multi-interface core extraction (mi-02)"]}
{"id":"al-02","title":"Define identity and lineage types","type":"implementation","status":"done","description":"Define AgentIdentity type: { commitSha: string, toolCompositionHash: string, derivedPromptHash: string }. Define LineageRecord: { parent: AgentIdentity | null, child: AgentIdentity, toolDiff: { added: string[], removed: string[] } }. TDD.","estimate":"20min","deps":["al-01"],"prereqs":[]}
{"id":"al-03","title":"Compute tool composition hash","type":"implementation","status":"done","description":"Pure function: given commit SHA + sorted tool-package names, produce a deterministic hash. SHA-256 of canonical JSON: { commit, tools: [...sorted names] }. This is the content-addressed identity. TDD.","estimate":"15min","deps":["al-02"],"prereqs":[]}
{"id":"al-04","title":"Wire commit SHA into AgentInvocation","type":"implementation","status":"done","description":"Add commitSha to AgentInvocation identity. Read from RAILWAY_GIT_COMMIT_SHA in production, git rev-parse HEAD in dev (with fallback to 'unknown'). Wire through createAgentCore.","estimate":"20min","deps":["al-02"],"prereqs":[]}
{"id":"al-05","title":"Stamp identity on trace and session events","type":"implementation","status":"done","description":"Add AgentIdentity fields to session:start event and orchestrator:route trace event. Pipeline can trace which commit + tool composition produced each session.","estimate":"20min","deps":["al-03","al-04"],"prereqs":[]}
{"id":"al-06","title":"Lineage recording","type":"implementation","status":"done","description":"When agent starts, compare current AgentIdentity against previous session's identity (from session store or env). If different, emit lineage:change event with LineageRecord (parent, child, toolDiff). If same, no event.","estimate":"30min","deps":["al-05"],"prereqs":[]}
```
