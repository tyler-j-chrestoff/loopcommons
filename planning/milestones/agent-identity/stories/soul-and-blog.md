# Story: Soul Document + Inaugural Blog Post

> As a **researcher (Tyler)**, I want the amygdala reframed from security classifier to identity/alignment system — with the agent's soul as a document, request metadata enriching the identity signal, and a blog post capturing the theory — so that the agent's security, memory, and behavior all derive from a coherent sense of self rather than hand-written rules.

**Theoretical grounding**: Session 25 conversation. Key insights:
- `A(soul, tools) = system_prompt` — prompts are derived, not written
- Amygdala prompt = SOUL.md (identity document, not threat classifier)
- Signal alignment = cosine of stream-of-consciousness against growth vector in latent space
- Threat detection IS misalignment detection — same operation, opposite sign
- Behavioral biometrics (IP, metadata) as dimensions of the identity embedding
- Brain-inspired subsystems: hippocampus (consolidation), thalamus (attention gating), ACC (conflict detection), DMN (between-session cognition), insula (self-state awareness)

## Acceptance Criteria

- SOUL.md document defining the agent's identity, values, growth direction — authored by Tyler, referenced by the amygdala prompt
- Amygdala prompt rewritten to be identity-grounded: "does this align with who I am?" rather than "is this a threat category?"
- Request metadata added to `AmygdalaInput`: IP (hashed), auth status, session count for this fingerprint, time-of-day
- Metadata flows through to memory writes as provenance context
- Blog post published: captures the theory (identity, A(soul,tools), signal alignment, brain subsystems, recursive coherence)
- Existing red-team tests still pass — the soul-based prompt must be at least as secure as the classifier prompt
- New eval: alignment-framed test cases (identity-coherent vs identity-divergent inputs)

## Tasks

```jsonl
{"id":"soul-01","story":"soul-and-blog","description":"Research: agent identity architectures + behavioral biometrics.","depends_on":[],"requires":"","status":"done"}
{"id":"soul-02","story":"soul-and-blog","description":"Write SOUL.md — the agent's identity document.","depends_on":["soul-01"],"requires":"","status":"done"}
{"id":"soul-03","story":"soul-and-blog","description":"Rewrite amygdala prompt to be soul-grounded.","depends_on":["soul-02"],"requires":"","status":"done"}
{"id":"soul-04","story":"soul-and-blog","description":"Add request metadata to AmygdalaInput.","depends_on":[],"requires":"","status":"done"}
{"id":"soul-05","story":"soul-and-blog","description":"Write and publish the blog post series (3 parts).","depends_on":["soul-02"],"requires":"","status":"done"}
```

