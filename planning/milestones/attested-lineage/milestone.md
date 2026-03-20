# Milestone: Attested Lineage

**Status**: planned
**Sessions**: 0.5–1 (parallelizable with CLI adapter)
**Stories**: 1
**Prerequisite**: multi-interface (core extraction)

Each agent instance's identity is content-addressed via the git commit SHA that produced it. Derived prompts carry lineage — parent hash, child hash, the diff in tool composition between them. This is the Attest primitive from the Möbius Principle: without it, agent-arena is hyperparameter search on a cylinder. With it, evolution operates on identities that can prove their ancestry.

Git already solves canonical serialization. Commit SHAs are deterministic over the exact file tree. When mmogit lands, these SHAs gain GPG signatures — the twist gets added to a chain that was structurally ready for it from day one.

## Key Decisions

- Commit SHA is the canonical identity for a tool composition. No custom hashing needed.
- Derived prompt identity = hash of (commit SHA + ordered tool-package names + derivation inputs).
- Lineage = parent identity + child identity + what changed (tool diff).
- Carried through AgentInvocation identity, stamped on trace/session events.
- Railway already provides RAILWAY_GIT_COMMIT_SHA in production. Dev uses git rev-parse HEAD.

## Key Risks

- Low risk. Git's content-addressing is battle-tested. The work is wiring, not invention.
- Determinism of buildSystemPrompt must be verified (no Date.now(), no random, no env-dependent branches).

## Verification Gate

- [ ] Every trace event carries the commit SHA that produced the running agent
- [ ] Derived prompt identity is a deterministic hash of commit SHA + tool composition
- [ ] Lineage header type exists with parent/child/diff fields
- [ ] Two agents from the same commit with the same tools produce the same identity hash
- [ ] Different commits or different tool sets produce different identity hashes
- [ ] Session events record lineage so the pipeline can trace ancestry

## Files

`packages/llm/src/orchestrator/index.ts`, `packages/llm/src/tool/derive.ts`, session event types

## Design Rationale

Agent-arena without attestation is just hyperparameter search. The compositions would have no way to vouch for their own continuity across generations. Nothing prevents a "successful" composition from being silently replaced by something with the same fitness score but completely different lineage. Attestation is what makes evolution produce genuine identity persistence rather than optimization over a fitness landscape.

See: `planning/memos/MOBIUS_PRINCIPLE.md`
