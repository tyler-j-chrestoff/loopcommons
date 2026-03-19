# Theory: Tools as Ontology

**Date**: 2026-03-18
**Status**: Draft — foundational framing for agent-memory milestone and beyond
**Source**: Session 23 planning conversation
**Context**: This document describes how Loop Commons implements SDI primitives at the application layer. It is not a standalone theory — it sits on top of the SDI protocol spec (`planning/specs/sdi-spec-v0.2.0.md`) and the Loop Commons technical spec (`planning/specs/loop-commons-spec-v0.1.0.md`).

---

## 0. Relationship to SDI

This theory is the application-layer interpretation of Sovereign Data Infrastructure (SDI) primitives. The concepts developed here map onto SDI's formal protocol:

| This Document | SDI Spec (v0.2.0) | Section |
|---|---|---|
| Memory entry | **Capsule** — immutable, content-addressed, signed | §3.1 |
| Amygdala threat assessment | **ℒ=ℬ Gate** — export pressure ≤ metabolizable boundary | §3.6 |
| Memory write gating | **Pre-Merge Gate Sequence** — 7 gates, cheap checks first | §6.1 |
| Memory consolidation / decay | **Metabolism** — declared-loss compression with back-pointers | §7 |
| Embedding-based recall | **Pointer Stubs + Hydration** — lazy, consent-gated, budget-limited | §3.7 |
| Memory types (Observation/Learning/etc) | **Scope + Modality** — observation/claim/belief/hypothesis/norm | §3.9 |
| Memory security | **RCE** — reciprocal consent, deferred not rejected | §3.6 |
| Tit-for-tat refusal | **Autonomy Suite** — RefusalPolicy, InfluenceConsent, UlyssesContract | §3.14 |
| Token budget / thermal tracking | **S/F/B/τ metrics** — Alignment, Feedback, Boundary, Buffer | §12 |
| Visibility scoping | **Visibility Classes** — local/private-export/federation/research | §3.8 |
| Tool capabilities + delegation | **UCAN Capabilities** — attenuable, revocable, time-bounded | §5 |
| Multi-agent governance | **Charter/Delegation/Treaty** — quorum, scope, cross-boundary rules | §3.5 |
| Training data provenance | **Capsule signatures** — Ring-0 invariant R0-5 | §4.3 |
| Recursive skill composition | **Commit DAG** — nested capsule references, append-only history | §3.2 |

**Design principle**: v1 implements these concepts as JSON files with Zod schemas. But the data model should be capsule-shaped from day one so that SDI integration is a backend swap, not a schema migration.

---

## 1. The Claim

An agent's identity is not its system prompt. An agent's identity is its **tool composition** — the set of capabilities it can exercise, the persistent state it can access, and the interfaces through which it perceives and acts. The system prompt is a lossy projection of this identity into natural language, not the source of truth.

This is Object-Oriented Ontology (OOO) applied to agent architecture. In OOO, objects are defined by their relations and capacities, not by essential inner nature. Objects "withdraw" — you never access the real object, only its relational surface. The system prompt is the relational surface. The tool composition is the withdrawn reality.

In SDI terms: an agent's DID identifies it, its Capabilities define what it can do, and its capsule history constitutes its memory. The system prompt is a PersonaMask (§3.11) — a presentation layer that steers retrieval without altering the underlying data.

---

## 2. Theoretical Grounding

### 2.1 Connection to the VAE Framework

The "Consciousness as Variational Inference" paper frames consciousness as a recursive VAE minimizing reconstruction loss under compression constraints. The variational bottleneck — where information is forced through a narrow channel — is where meaningful representation emerges. Compression IS cognition.

This theory extends the bottleneck to three timescales:

| Timescale | Bottleneck | What's compressed | Where it happens today |
|-----------|-----------|-------------------|----------------------|
| **Per-message** | Amygdala rewrite | User input → safe canonical form | `createAmygdala()` in route.ts |
| **Per-interaction** | Memory write | Full interaction → what to remember | Not yet implemented |
| **Per-generation** | Evolutionary selection | Agent population → surviving architectures | Not yet implemented |

At each timescale, the bottleneck decides what survives. The mechanism is the same — compression under constraint — but the unit being compressed changes: a message, an experience, an entire agent design.

### 2.2 Connection to mmogit

mmogit's StructuredMemory protocol treats memory as sovereign — signed, persistent, owned by the agent, not granted by a platform. Its post/remember duality distinguishes low-cost expression (thermal 0.3) from high-cost structured integration (thermal 0.6-0.8). The insight: not all cognition requires the same energy. Some things are impressions; some are commitments to memory.

mmogit's sovereignty constitution declares: "Right to Memory Persistence — signed thoughts persist; deletion requires private key." The agent's memories belong to IT, not to the interface that triggered them.

Both principles apply here. Persistent state is the agent's property, not the web chat's. And the cost of memory operations should be proportional to their significance.

### 2.3 Connection to OOO

In Harman's OOO, objects have two dimensions:
- **Sensual qualities** — what's accessible to other objects (the relational surface)
- **Real qualities** — what withdraws, what's never fully accessible

For an agent:
- **Sensual qualities** = the system prompt, the API surface, the responses it generates
- **Real qualities** = the tool composition, the memory state, the routing position, the accumulated experience

You can never fully specify an agent's identity in a prompt. The prompt is always a lossy compression. But if you specify the tool composition correctly, the identity emerges — because behavior is constrained by capability, not by instruction.

---

## 3. Persistent State as Tool

The key architectural move: **persistent state is a polymorphic tool interface, not a special subsystem.**

```
Traditional architecture:
  amygdala ←[hardwired]→ memory subsystem
  subagents ←[no access]→ memory subsystem

OOO architecture:
  any agent ←[tool registry]→ memory_recall tool ←→ PersistentState interface
  any agent ←[tool registry]→ memory_remember tool ←→ PersistentState interface
```

The `PersistentState` interface:

```typescript
interface PersistentState {
  recall(query: RecallQuery): Promise<Memory[]>;
  remember(entry: MemoryInput): Promise<Memory>;
}
```

Implementations are swappable:
- `JsonFilePersistentState` — v1, file on Railway volume (capsule-shaped entries, no signatures)
- `SdiPersistentState` — future, full SDI capsules with CID addressing, Ed25519 signatures, DAG-CBOR serialization
- `EmbeddingPersistentState` — future, SDI Pointer Stubs (§3.7) with relevance-gated hydration
- `CompoundPersistentState` — future, combines multiple backends (local + federation)

Memory tools are created by a factory — same pattern as blog tools:

```typescript
const memoryTools = createMemoryTools({ state: jsonFileState });
// Returns: memory_recall, memory_remember as defineTool instances
```

These tools enter the registry like any other. The orchestrator scopes them like any other. An agent that has `memory_recall` can remember. One that doesn't, can't. **Memory is a capability, not infrastructure.**

### 3.1 Implications for the Amygdala

The amygdala currently has no tools — that's what makes it the security layer. There are three options:

**Option A: Amygdala gets memory tools as exception.** The amygdala needs memory for threat context (has this user been adversarial before?). Give it `memory_recall` only — it can read memory but not write. Writes happen post-interaction through a separate path. This preserves "amygdala has minimal capabilities" while enabling context-aware security.

**Option B: Orchestrator mediates memory on amygdala's behalf.** The orchestrator reads memory before invoking the amygdala and passes it as context (the existing `memoryContext` field). The amygdala's output includes memory write recommendations, but the orchestrator executes them. The amygdala stays tool-free. Memory access is a property of the pipeline, not the agent.

**Option C: Amygdala IS just another agent with specific tools.** Its identity as "security layer" emerges from having `memory_recall` + `threat_assess` but NOT `blog_write` or `web_search`. It's not architecturally special — it's just an agent with a specific tool composition. This is the most OOO-consistent option and the most radical.

**Recommendation for v1**: Option B. It's the simplest, it preserves the existing architecture, and it doesn't require rethinking what "no tools" means for the amygdala. The `memoryContext` field already exists. Option C is the long-term direction — when the arena makes hand-designed architecture untenable, the amygdala will need to be just another composable agent.

### 3.2 Implications for Memory Security

If memory is a tool, then memory security is tool-scoping. This maps directly onto SDI's Pre-Merge Gate Sequence (§6.1):

| SDI Gate | Loop Commons Implementation |
|---|---|
| 1. Shape Validation | Zod schema validation on memory entry (Ring-0 equivalent) |
| 2. Signature Verification | v1: skip. Future: Ed25519 signature on capsule |
| 3. Semantic Diff / Vmax | Amygdala threat assessment — is this memory within the agent's metabolizable boundary? |
| 4. Vector Alignment | v1: skip. Future: embedding similarity check |
| 5. Safety Envelope (ℒ=ℬ) | `threatLevel < threshold` — export pressure of the interaction must not exceed the agent's safe contradiction window |
| 6. Human Impact Check | Admin notification for high-significance memory writes (future) |
| 7. Capability Check | Tool scoping — only agents with `memory_remember` capability can write |

Concretely for v1:
- **Write protection**: Only the orchestrator invokes `memory_remember`, gated by amygdala's threat assessment. This is the ℒ=ℬ gate in application form.
- **Poisoning defense**: High-threat interactions produce no trusted memories. The amygdala's `threatLevel` IS `L.magnitude` — if it exceeds the agent's Beverly Band width, the write is suppressed.
- **Recall filtering**: The amygdala sees `memoryContext` and can flag suspicious entries. A recalled memory that contradicts current observation is a semantic diff exceeding Vmax — the amygdala notes the contradiction.
- **Audit trail**: Memory tools emit trace events (`memory:recall`, `memory:write`). In SDI terms, every memory operation produces a capsule with full provenance (agent DID, timestamp, cited inputs).
- **Visibility**: Memory entries carry a visibility class (local/private-export/federation/research). v1: all memories are `local`. Future: admin can promote memories to `federation` for training data export.

---

## 4. Derived System Prompts

If tools define identity, then system prompts should be **generated from tool composition**:

```typescript
function deriveSystemPrompt(tools: Tool[], role?: string): string {
  const capabilities = tools.map(t => t.description).join('\n');
  const restrictions = deriveRestrictions(tools); // what you CAN'T do
  return `${role ? `You are a ${role}. ` : ''}
You have the following capabilities:
${capabilities}

You do NOT have access to: ${restrictions}
Your behavior should reflect your capabilities — do not attempt actions beyond your tool set.`;
}
```

This is a necessity for the evolutionary arena (you can't hand-write prompts for randomly composed agents), but it's useful now:

- **Correctness guarantee**: The prompt always matches actual capabilities. No drift between what the prompt says and what the agent can do.
- **Subagent simplification**: The 7 subagent configs in `registry.ts` each have hand-written prompts. These could be generated from their tool lists + a role string.
- **Dynamic composition**: When the orchestrator adjusts tool access based on context (auth, budget pressure, threat level), the system prompt automatically reflects the change.

### 4.1 When NOT to Derive

Not everything should be generated. The amygdala's substrate-awareness prompt — the core research contribution — encodes domain knowledge about transformer failure modes, social engineering patterns, and the philosophical framing of consciousness. This can't be derived from tools. It's the agent's "training" or "education," not its "capability set."

The hybrid model: **derived capability description + authored domain knowledge**. The tool composition generates the "what you can do" section. The researcher writes the "how to think about it" section.

---

## 5. The Trajectory

These ideas imply a specific sequence of milestones. Each is independently useful but builds toward the evolutionary agent architecture.

### Phase 1: Agent Memory (current milestone)

**What**: Persistent state as a polymorphic tool interface. Memory tools (`memory_recall`, `memory_remember`) backed by `JsonFilePersistentState`. Orchestrator mediates memory for the amygdala (Option B). Memory trace events. Memory inspector viz. **Capsule-shaped entries from day one** — id, provenance (agent, timestamp, used), modality, uncertainty, visibility class. JSON storage, no signatures yet.

**Why now**: The agent has no continuity. Every session starts blank. This is the minimum viable persistent self.

**SDI alignment**: Memory entries are proto-capsules (§3.1). Threat-gated writes are the ℒ=ℬ gate (§3.6). Visibility defaults to `local` (§3.8). Modality on entries enables epistemic humility (§3.9).

**Extensibility seams**:
- `PersistentState` interface accepts any backend (JSON → SDI capsules)
- Memory tools are scoped like any other tool (→ UCAN capabilities)
- Trace events feed the training pipeline (→ attested capsule provenance)
- `memoryContext` on amygdala input is the integration point
- Entries are capsule-shaped: adding `proof` field later is additive, not migration

### Phase 2: Tools as Packages

**What**: Extract tools from `packages/web/src/tools/` into standalone packages (`packages/tools-blog`, `packages/tools-memory`, etc.). Each package exports a factory + tool definitions. Any interface imports the packages it needs.

**Why next**: The web chat is currently the only interface. Before adding a second interface (Reddit, CLI, whatever), tools need to be portable. This is also the prerequisite for derived system prompts — tools need richer self-description (intent, cost, boundary constraints) to generate good prompts.

**Extensibility seams**:
- Tool packages declare metadata (not just schema)
- Factory pattern enables dynamic composition
- Interface adapters are thin wrappers around tool packages

### Phase 3: Derived System Prompts

**What**: `deriveSystemPrompt(tools, role?)` generates capability descriptions from tool metadata. Subagent configs use derived prompts instead of (or alongside) hand-written ones. The orchestrator can dynamically adjust prompts when tool access changes.

**Why here**: Once tools are packages with rich metadata, prompt derivation is straightforward. This decouples identity from hand-written text, which is prerequisite for the arena.

**Extensibility seams**:
- Hybrid model: derived capabilities + authored domain knowledge
- Prompt generation is a function, not a template — can be optimized by calibration

### Phase 4: Multi-Interface Identity

**What**: The agent operates on multiple interfaces (web chat, Reddit, HN, CLI) with a shared persistent state and tool set. Each interface is a thin adapter that translates interface-specific I/O into the universal agent invocation contract.

**Why here**: Tools are packages (Phase 2), prompts are derived (Phase 3), memory is interface-agnostic (Phase 1). Adding a new interface is now just writing an adapter.

**Extensibility seams**:
- Sovereign identity (mmogit-style Ed25519) for cross-interface provenance
- Interface-specific tool scoping (Reddit bot gets different tools than admin web chat)
- Unified memory across interfaces

### Phase 5: Evolutionary Agent Arena

**What**: Spawn agents with random tool compositions. Let them learn, teach, compete. Selection pressure drives toward optimal architectures. Winning base agents compose into compound agents. System prompts are fully derived. Training data captures which compositions beat which others under which conditions.

**Why last**: Requires all previous phases. Memory (persistent learning), tool packages (composable capabilities), derived prompts (no hand-writing), multi-interface (the arena IS an interface). This is the endgame — evolution as variational inference over agent populations.

**SDI alignment**: The arena IS a federated SDI network. Each agent is a sovereign node with a DID. Tool sharing is governed by Treaties (§3.5.3). Teaching is Influence (§3.14.5) with declared export pressure. Selection pressure operates through metabolism — agents that can't compress efficiently run out of τ. The arena's training data output is a set of signed capsules with complete provenance — content-addressed, tamper-evident, attributable to specific agent identities.

### Cross-Cutting: SDI Integration

SDI integration is not a phase — it's a gradient applied across all phases:

| Phase | SDI-Lite (v1) | Full SDI (future) |
|---|---|---|
| 1. Memory | Capsule-shaped JSON, no signatures | CID-addressed capsules, Ed25519 signed |
| 2. Packages | Tool factories with Zod schemas | UCAN capabilities with attenuable delegation |
| 3. Prompts | Generated from tool metadata | Generated from UCAN capability sets |
| 4. Multi-interface | Shared JSON file on Railway volume | Federated capsule DAG via gossip |
| 5. Arena | Local tournament with JSON logging | Federated arena with signed results on SDI relays |

The principle: **start with the shapes, add the cryptography later.** If memory entries are capsule-shaped, adding `proof` is a field addition. If the `PersistentState` interface mirrors capsule CRUD, swapping to SDI is a backend change. If trace events are capsule-compatible, the `AttestingCollector` from the Loop Commons spec (§9.3) wraps the existing collector.

---

## 6. What This Changes About the Current Plan

The agent-memory milestone stories (memory-research, memory-core) should be updated to reflect the "persistent state as tool" framing:

1. **mem-01 (research)** should include tool-based memory architectures in the survey, not just traditional memory systems. How do other projects expose memory as agent capabilities?

2. **mem-06 (memory module)** should implement the `PersistentState` interface and `createMemoryTools` factory, not a bespoke memory subsystem wired into the amygdala.

3. **mem-07 (amygdala extension)** should be reframed: instead of extending `AmygdalaResult` with `memoryWrites`, the orchestrator passes `memoryContext` (from recall) to the amygdala and handles writes post-interaction based on the amygdala's threat assessment. Option B from Section 3.1.

4. **mem-08/09 (route.ts wiring)** should register memory tools in the tool registry and scope them via the orchestrator, not hardwire memory calls.

5. **mem-10 (viz)** stays the same — memory trace events regardless of architecture.

6. **mem-11/12 (red-team + continuity)** stay the same — the tests don't care about internal architecture.

The research story (session 23) should include this theory doc as required reading and validate/challenge it against the survey findings.

---

## 7. Recursive Composition: Skills All the Way Down

Every skill is composed of sub-skills. Every sub-skill is composed of sub-sub-skills. There is no fundamental level — just composition at different scales.

This is already partially true in the codebase:
- The orchestrator invokes subagents, which are effectively "skills" that themselves have tools
- `createBlogTools` returns 8 tools, but `publish_post` internally validates, moves files, updates frontmatter
- The amygdala is a "skill" the orchestrator calls before routing
- The agentic loop already supports tools that make LLM calls (tools invoking sub-agents)

The move is making this **explicit and uniform**: a tool's implementation can itself use tools. An agent IS a tool from its caller's perspective. The boundary between "agent" and "tool" dissolves.

```
arena
  └── compound_agent (skill)
        ├── security_agent (sub-skill)
        │     ├── memory_recall (sub-sub-skill)
        │     └── threat_assess (sub-sub-skill)
        ├── blog_agent (sub-skill)
        │     ├── write_post (sub-sub-skill)
        │     │     ├── validate_slug
        │     │     └── persist_file
        │     └── memory_remember (sub-sub-skill)
        └── ...
```

### The VAE Bottleneck at Every Scale

The variational compression bottleneck exists at every level of the hierarchy:

| Scale | What's compressed | Bottleneck |
|-------|------------------|------------|
| Sub-skill | Raw I/O → structured result | Function signature + validation |
| Skill (tool) | Sub-skill outputs → capability | Tool schema (Zod) |
| Agent | Tool outputs → coherent response | Context window + system prompt |
| Compound agent | Sub-agent outputs → coordinated behavior | Orchestrator routing |
| Arena | Agent population → surviving architectures | Selection pressure (fitness) |

At each level: inputs are compressed through a constrained channel, and what survives the compression IS the meaningful representation. Same mechanism, every scale. This is the VAE thesis applied recursively.

### OOO Implication

In OOO, objects are composed of objects all the way down — there's no "fundamental" level where you reach bare matter. Identity emerges from composition at whatever scale you observe. A tool is an object. An agent composed of tools is an object. An arena composed of agents is an object. Each withdraws from full access by the level above it — you only see the relational surface (the tool schema, the API contract, the fitness score).

### Practical Implication for `defineTool`

The existing `defineTool` interface doesn't prevent tools from using other tools internally — but it doesn't make it a first-class pattern either. For recursive composition to work cleanly:

1. **Tool factories should accept tool registries** — `createSecuritySkill({ tools: [memory_recall, threat_assess] })` returns a compound tool that internally orchestrates sub-tools
2. **Tool metadata should declare sub-skills** — so derived system prompts can describe capabilities at the right level of abstraction ("can assess security threats" vs "can recall memory and classify threats")
3. **Cost should propagate up** — a compound skill's cost is the sum of its sub-skill costs. The thermal model needs to account for this.

This doesn't need to be built now. But the `PersistentState` interface and `createMemoryTools` factory in Phase 1 should be designed as composable sub-skills, not terminal leaves.

---

## 8. Open Questions

1. **Should the amygdala eventually become a tool-defined agent (Option C)?** If so, what tool composition defines "security layer"? What's the minimal tool set that produces security behavior?

2. **How does memory cost scale?** If every interaction writes memories and every interaction recalls memories, that's two extra tool calls per request. At Haiku pricing, is this negligible? Does thermal-aware recall (skip memory under budget pressure) matter?

3. **What's the right memory type system?** mmogit has 8 types. Calibration memory has 4. The agent's world model might need different types entirely. The research survey should inform this.

4. **How do derived prompts interact with auto-calibration?** If the calibration loop optimizes tool selection instead of prompt text, the search space is combinatorial (2^n tool subsets). Is that tractable?

5. **Is the arena actually feasible at reasonable compute cost?** Evolutionary search is expensive. What's the minimum viable population size and generation count?

6. **How deep does recursive composition go in practice?** At what depth does the overhead of composition (schema validation, context passing, cost tracking) exceed the value? Is there a natural "cell size" — a minimal viable skill that shouldn't be decomposed further?

7. **How do compound skills declare their capabilities?** If `security_agent` is a skill composed of `memory_recall` + `threat_assess`, does its derived prompt say "can assess security threats" or "can recall memory and classify threat levels"? The right abstraction level depends on the caller.
