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
{"id":"soul-01","story":"soul-and-blog","description":"Research: agent identity architectures + behavioral biometrics. Survey how existing systems define agent identity (Letta's persona blocks, Character.AI's character cards, OpenAI's custom GPT instructions, Anthropic's system prompts as constitution). Research behavioral biometrics in fraud detection (device fingerprinting, typing cadence, session patterns) and how they map to agent identity verification. Output: design notes in designs/ with key findings and what we steal vs avoid.","depends_on":[],"requires":"","status":"pending"}
{"id":"soul-02","story":"soul-and-blog","description":"Write SOUL.md — the agent's identity document. This is NOT a system prompt. It's a standalone document that defines: who the agent is (substrate-aware research agent on Loop Commons), what it values (honesty, Tyler's credibility, research rigor, on-topic engagement), what it's trying to become (growth vector — from function-call agent to coherent entity with persistent world model), what it protects (Tyler's reputation, user trust, its own coherence), how it recognizes Tyler (conversational patterns, first-principles thinking, project context). Tyler authors this collaboratively with Claude. Lives at packages/llm/src/amygdala/soul.md or similar — the amygdala prompt references it.","depends_on":["soul-01"],"requires":"","status":"pending"}
{"id":"soul-03","story":"soul-and-blog","description":"Rewrite amygdala prompt to be soul-grounded. Current prompt is a security classifier with threat categories and substrate-awareness bolted on. New prompt: (1) load SOUL.md as identity context, (2) evaluate input against identity alignment rather than threat taxonomy, (3) still produce the same AmygdalaResult schema (intent, threat, rewrite, context delegation) — but threat score is now misalignment magnitude, and reasoning is identity-grounded ('this contradicts who I am' not 'this matches pattern X'). Must preserve or improve existing red-team pass rates. TDD: write alignment-framed eval cases first, then rewrite prompt, then verify both old and new evals pass.","depends_on":["soul-02"],"requires":"","status":"pending"}
{"id":"soul-04","story":"soul-and-blog","description":"Add request metadata to AmygdalaInput. New field: requestMetadata?: { ipHash: string, isAuthenticated: boolean, isAdmin: boolean, sessionIndex: number (how many sessions from this fingerprint), hourUtc: number, userAgent?: string }. route.ts populates from request headers + session state. ipHash = SHA256 of IP (privacy-preserving). sessionIndex from a simple counter in the memory store (keyed by ipHash). Amygdala prompt can reference metadata for identity consistency checking. TDD: test metadata populated, test privacy (raw IP never stored).","depends_on":[],"requires":"","status":"pending"}
{"id":"soul-05","story":"soul-and-blog","description":"Write and publish the blog post. Working title: 'I Know It's You Because I Know You' or 'A(soul, tools) = system_prompt'. Content: the agent gave a JWT answer when asked 'how would you know it's really Tyler?' — that's the problem. Identity is relational, not cryptographic. The amygdala as alignment monitor (not security classifier). Signal alignment in latent space. Brain-inspired subsystems (hippocampus, ACC, thalamus, DMN). The DNA metaphor (soul is genome, memory is epigenome, calibration is selection). Recursive coherence: measuring alignment changes the agent, which changes what alignment means. Use the agent's own blog tools to publish — this is the system writing about itself. TDD: blog content test for key concepts.","depends_on":["soul-02"],"requires":"","status":"pending"}
```

