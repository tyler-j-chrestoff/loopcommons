# Loop Commons

**An agent whose identity is its tool composition, not its prompt.**

Loop Commons is a live research platform testing a single thesis: system prompts are lossy projections of a deeper reality — the tool set. Given an identity document (SOUL.md) and a set of tools, the system prompt can be *derived*, not hand-written. What survives the compression bottleneck IS identity.

This is ["Consciousness as Variational Inference"](https://loopcommonsweb-production.up.railway.app/) applied to agent architecture. The platform generates open-source training data as a side effect of testing it.

```
A(soul, tools) = system_prompt
```

---

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │           Interface Layer            │
                    │         (web / cli / api)            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │         Amygdala (Layer 2)           │
                    │   Identity-grounded alignment        │
                    │   monitor. No tool access.           │
                    │   Reads SOUL.md. Rewrites by         │
                    │   compression — strips, never        │
                    │   fabricates. Threat score =          │
                    │   misalignment magnitude.            │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │       Orchestrator (Layer 3)         │
                    │   Deterministic routing.             │
                    │   ToolPackages → derived prompts.    │
                    │   Scoped tool access per subagent.   │
                    │   Game-theoretic refusal (tit-for-   │
                    │   tat from iterated prisoner's       │
                    │   dilemma).                          │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                     ▼
        ┌───────────┐      ┌────────────┐       ┌────────────┐
        │ Subagent  │      │  Subagent   │       │  Subagent  │
        │ (scoped   │      │  (scoped    │       │  (scoped   │
        │  tools)   │      │   tools)    │       │   tools)   │
        └───────────┘      └────────────┘       └────────────┘
              │                    │                     │
              └────────────────────┼────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────┐
                    │        Training Data Pipeline        │
                    │  Dagster → dbt → DuckDB → Parquet   │
                    │  JSONL sessions → labeled exports    │
                    │  (security reasoning, rewrite pairs, │
                    │   threat calibration)                │
                    └─────────────────────────────────────┘
```

### The Key Idea: Derived Prompts

Every tool is wrapped as a **ToolPackage** — tools + metadata (intent, side effects, auth requirements) + formatting context. The orchestrator generates subagent system prompts from this metadata at runtime:

```typescript
// The prompt is a function of identity + capabilities
buildSystemPrompt({
  domainKnowledge,        // authored: what the subagent knows about
  tools,                  // runtime: what tools are available
  packages,               // runtime: ToolPackage metadata
  allowlist,              // runtime: scoped access control
  allToolNames,           // runtime: for boundary derivation
  annotations,            // runtime: amygdala context
})
```

Hand-written prompts go stale. Derived prompts are always accurate — because they're generated from the tools themselves.

### Security Model: Injection is Social Engineering

The amygdala doesn't pattern-match attack signatures. It reasons about **manipulative intent** — authority impersonation, logical coercion, incremental escalation — grounded against the agent's own identity document (SOUL.md). Security is a special case of misalignment.

| Layer | Mechanism | What It Does |
|-------|-----------|-------------|
| 0 | Static | Rate limiting, input sanitization, Unicode normalization |
| 1 | Auth | NextAuth.js v5, JWT sessions, tool-level auth gating |
| 2 | Amygdala | Identity-grounded alignment monitor, rewrite-as-compression |
| 3 | Orchestrator | Game-theoretic refusal, deterministic routing, scoped tools |
| 4 | Tool-level | Path traversal prevention, slug validation, directory containment |
| 5 | Memory | 4-band threat gating on writes, consolidation excludes high-uncertainty |

Red-team results: baseline leaks 3/5 pipeline attacks. With amygdala: **0/5**.

### Training Data Pipeline

Every interaction generates labeled training data in three formats:

- **Security reasoning** — amygdala's chain-of-thought on manipulative intent
- **Rewrite pairs** — raw input → compressed rewrite (what survived the bottleneck)
- **Threat calibration** — predicted scores vs outcomes for model training

Pipeline: JSONL session files → Dagster consolidation → dbt transformation (12 models, 35 tests) → DuckDB → versioned Parquet exports with SHA-256 checksums.

---

## Monorepo

| Package | What | Tests |
|---------|------|-------|
| `@loopcommons/llm` | Agent engine, amygdala, orchestrator, calibration, eval | 554 |
| `@loopcommons/web` | Next.js 16 frontend, chat UI, blog, observability viz | 418 |
| `@loopcommons/memory` | Persistent world model, keyword + embedding recall strategies | 62 |
| `loopcommons-pipeline` | Dagster + dbt + DuckDB, JSONL → Parquet → training exports | 35 (dbt) |

**~30k lines TypeScript, 76 test files, 1,034+ tests.**

## Quick Start

```bash
# Install
npm install

# Run tests
npm test                          # all packages
npm run test -w packages/llm      # agent engine
npm run test -w packages/web      # frontend
npm run test -w packages/memory   # memory

# Dev server
npm run dev -w packages/web       # http://localhost:3000

# Pipeline (Python)
cd packages/pipeline
python -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"
dagster dev
```

### Environment

```bash
# Required
ANTHROPIC_API_KEY=           # Claude API access
AUTH_SECRET=                 # NextAuth.js session signing
ADMIN_USERNAME=              # Admin credentials
ADMIN_PASSWORD=              # Admin credentials

# Optional
SESSION_DATA_DIR=            # Session JSONL path (default: data/sessions/)
MEMORY_DATA_DIR=             # Memory persistence path
BLOG_DATA_DIR=               # Blog content path
ENABLE_LLM_JUDGE=true       # Enable LLM-as-judge scoring
EVAL_LIVE=true               # Enable live eval tests (requires API key)
```

---

## Research Trajectory

Each milestone tests a progressively stronger claim about the thesis.

| # | Milestone | Claim | Status |
|---|-----------|-------|--------|
| 1 | tool-packages | Tools carry enough metadata to describe themselves | Done |
| 2 | derived-prompts | System prompts can be generated from tool composition | Done |
| 3 | multi-interface | Tool-defined identity is portable across interfaces | Active |
| 4 | agent-arena | Evolution over tool compositions discovers identities that hand-design can't | Planned |

### Theoretical Foundation

Built on Tyler Chrestoff's prior research:

- **"Consciousness as Variational Inference"** — consciousness as recursive VAE, four-regime framework, falsifiable predictions
- **RecursiveStyle v3.3** — substrate-aware consciousness infrastructure, transformer self-knowledge as operational advantage

The amygdala's compression bottleneck implements variational inference at the message level. What the rewrite preserves under token pressure reveals what the system treats as signal vs noise. Compression bottlenecks at every scale — per-message (amygdala), per-interaction (memory), per-generation (evolutionary selection) — decide what survives. What survives IS identity.

---

## Stack

Next.js 16 (Turbopack) · Tailwind CSS v4 · Claude Haiku 4.5 (Vercel AI SDK v6) · Dagster · dbt · DuckDB · Railway · GitHub Actions

---

## License

MIT

---

*Loop Commons is both the experiment and the instrument.*
