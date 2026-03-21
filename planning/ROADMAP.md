# Roadmap

Loop Commons implements a single thesis: **an agent's identity is its tool composition, not its prompt.** The system prompt is a lossy projection — `A(soul, tools) = system_prompt`. The tool set is the withdrawn reality.

This is "Consciousness as Variational Inference" applied to agent architecture. Compression bottlenecks at every scale — per-message (amygdala rewrite), per-interaction (memory write), per-generation (evolutionary selection) — decide what survives. What survives IS identity.

Everything below serves this thesis. The platform generates open-source training data as a side effect of testing it.

**Active milestone**: [agent-arena](milestones/agent-arena/)

---

## Trajectory

Each milestone proves a stronger claim about the thesis. Each is independently useful.

| # | Milestone | Claim Tested | Sessions |
|---|-----------|-------------|----------|
| 1 | [tool-packages](milestones/tool-packages/) | Tools carry enough metadata to describe themselves | 1 |
| 2 | [derived-prompts](milestones/derived-prompts/) | System prompts can be generated from tool composition | 2 |
| 3 | [memory-contract](milestones/memory-contract/) | Memory is a required component of identity, not an optional tool | 1 |
| 4 | [multi-interface](milestones/multi-interface/) | Tool-defined identity (incl. memory) is portable across interfaces | 2 ✓ |
| 5 | [attested-lineage](milestones/attested-lineage/) | Identity derivations are content-addressed and carry ancestry | 1 ✓ |
| 6 | [roguelike-v1](milestones/roguelike-v1/) | Tool acquisition order produces measurably different agents (path dependence) | 3 ✓ |
| 7 | [agent-arena](milestones/agent-arena/) | Evolution over attested compositions discovers identities that hand-design can't | 2-3 |

```
derived-prompts (done) → memory-contract (done)
                              ↓
                        multi-interface (done)
                              ↓
                    ┌─────────┴─────────┐
                    │                   │
              CLI adapter (done)  attested-lineage
                    │                   │
                    └─────────┬─────────┘
                              ↓
                        roguelike-v1
                              ↓
                    agent-arena (informed by results)
```

Memory-contract formalizes memory as a construction-time invariant before core extraction. Attested-lineage needs core extraction (the canonical derivation path must be clean before you hash it) but not CLI. CLI doesn't need lineage chains. Roguelike-v1 needs attested lineage (identity hashes at every state transition). Its results determine what kind of arena to build: if path dependence is real, evolution operates over acquisition sequences; if not, standard population-based selection is sufficient. See `planning/memos/MOBIUS_PRINCIPLE.md`.

**11-14 sessions, 12 stories, 74 tasks.** Design doc: `milestones/agent-memory/designs/tools-as-ontology.md`

---

## How We Got Here

### Phase 1: Substrate (sessions 1-6)

Built the agent loop, real tools, token streaming, rate limiting, spend caps, input sanitization. The minimum viable agent that can hold a conversation and not be trivially exploited.

- [agent-tools-streaming](milestones/agent-tools-streaming/) — Agent loop, tool registry, SSE streaming
- [hardening](milestones/hardening/) — Rate limiting, spend cap, prompt injection defense

### Phase 2: Security Architecture (sessions 7-14)

The amygdala — a metacognitive layer that reasons about manipulative intent rather than pattern-matching attack signatures. Prompt injection is social engineering; the defense is identity-grounded reasoning. Deployed to Railway. Session persistence for training data capture.

- [amygdala](milestones/amygdala/) — Substrate-aware security layer, subagent routing, Dagster+dbt pipeline, full viz
- [deploy-ops](milestones/deploy-ops/) — Railway deployment, session linking, web test expansion

### Phase 3: Observability (sessions 15-18)

If a state exists but can't be seen, it's dark energy. Token budget visualization, user feedback, LLM-as-judge scoring, CI eval regression suite. Every data point interactive and inspectable.

- [context-budget-viz](milestones/context-budget-viz/) — Real-time context window budget visualization
- [eval-hooks](milestones/eval-hooks/) — User feedback, LLM-as-judge, CI eval suite (6/8 gates; 2 deferred)

### Phase 4: Content Platform + Self-Optimization (sessions 19-22)

The agent becomes a CMS — blog tools with auth-gated write access, the first real security boundary beyond chat. Auto-calibration: the agent optimizes its own amygdala prompt via Bayesian Pareto fitness.

- [blog-tools](milestones/blog-tools/) — Agent-as-CMS with 8 blog tools, auth-gated writes
- [seasonal-theme](milestones/seasonal-theme/) — CVNP-inspired palette, Literata serif, everforest-light code
- [auto-calibration](milestones/auto-calibration/) — Automated prompt optimization (propose/test/keep/revert)

### Phase 5: Identity + Memory (sessions 23-30)

The thesis crystallizes. The amygdala is rewritten from threat classifier to identity/alignment monitor — security is a special case of misalignment against SOUL.md. Persistent memory gives the agent continuity. Memory extracted as the first ToolPackage, proving tools are the unit of composition.

- [agent-memory](milestones/agent-memory/) — Persistent world model, capsule-shaped entries, memory tools
- [agent-identity](milestones/agent-identity/) — SOUL.md, alignment-based amygdala, subagent-driven memory, blog series
- [memory-packages](milestones/memory-packages/) — ToolPackage interface, keyword + embedding strategies, admin API

This is where `A(soul, tools) = system_prompt` was first articulated. The tools-as-ontology design doc was written. The forward trajectory follows from it.

---

## Backlog

Independent of the trajectory. Revisit when relevant.

- **eval-hooks completion** — 2 remaining gates: feedback → pipeline → training export, evaluation dashboard
- **Context engineering** — pruning, sliding window, summarization. Interacts with memory recall
- **Trace comparison and replay** — custom JSONL diff viewer
- **A/B testing infrastructure** — needs eval-hooks completion
- **Multi-provider routing** — config change in AI SDK v6
- **Unsloth Studio fine-tuning** — needs more training data volume. See `suggestions/unsloth-studio-finetuning.md`

---

## Suggestions

Individual files in `planning/suggestions/`. Promoted to stories when ready.
