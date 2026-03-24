# Agent Framework Landscape Research

**Task**: af-01b
**Date**: 2026-03-24
**Status**: Complete

---

## The Big Two: OpenClaw and NanoClaw

### OpenClaw

- **Stars**: ~332k (most-starred software project on GitHub as of March 2026)
- **Language**: TypeScript (Node.js runtime)
- **Architecture**: Local-first Gateway control plane. A WebSocket server (`ws://127.0.0.1:18789`) manages sessions, channels, tool execution, and agent coordination. Clients connect to the Gateway — CLI, macOS app, iOS/Android nodes, WebChat UI. ~500k lines of code, 53 config files, 70+ dependencies.
- **Multi-channel**: 20+ platforms (WhatsApp via Baileys, Telegram via grammY, Slack via Bolt, Discord via discord.js, Signal, iMessage, IRC, Teams, Matrix, LINE, etc.). Group routing with mention gating, reply tags, per-channel chunking.
- **Identity**: SOUL.md — a markdown file defining personality, values, communication style, behavioral constraints. Read on every startup, applied as system-level context to all interactions. Also supports TOOLS.md, IDENTITY.md, HEARTBEAT.md. Fallback resolution chain: global config > per-agent config > workspace files.
- **Memory**: Session-based. Context compaction (summarization), pruning, per-session config. No structured long-term memory beyond session history.
- **Security**: Application-level. DM pairing codes for unknown senders, allowlists, permission checks. Everything runs in one Node process with shared memory. **This is the core weakness.** CVE-2026-25253 (CVSS 8.8): token leak via malicious link gave full admin control. 42k+ publicly exposed instances found. 20% of ClawHub skills found malicious (ToxicSkills audit). Prompt injection via shared feeds. Microsoft, Cisco, Kaspersky all published warnings.
- **Extensibility**: Skills platform (ClawHub registry), cron jobs, webhooks, custom tools via RPC.

**Key insight**: OpenClaw proves massive demand for personal AI agents on existing channels. It also proves that application-level security is insufficient — the project became a case study in what goes wrong when agents have ambient authority without OS-level isolation.

### NanoClaw

- **Stars**: ~25k
- **Language**: TypeScript (~95%), ~15 source files, ~500 lines of core logic
- **Architecture**: Single Node.js process orchestrating containers. Channels poll for messages, store in SQLite, the polling loop picks them up, spawns an isolated container running Claude Agent SDK, gets the response back via filesystem IPC.
- **Multi-channel**: WhatsApp, Telegram, Discord, Slack, Gmail. Channels self-register at startup via `src/channels/registry.ts`. New channels added via Claude Code skills, not core code changes.
- **Identity**: Per-group CLAUDE.md files mounted into containers. Each group gets its own memory file. No unified cross-channel identity — each conversation group is isolated.
- **Memory**: SQLite (better-sqlite3) for messages, groups, sessions, scheduled tasks, router state. Per-group CLAUDE.md for conversational memory. No semantic/vector memory.
- **Security**: OS-level container isolation. Each agent session runs in its own Docker container (Linux) or Apple Container (macOS). Only explicitly mounted directories are accessible. Even a compromised LLM can only touch its sandbox. This is the direct response to OpenClaw's security failures.
- **Extensibility**: Fork-and-modify philosophy. Codebase small enough to audit in 8 minutes. Claude Code skills for customization rather than a plugin API.
- **Agent SDK**: Runs directly on Anthropic's Claude Agent SDK inside containers.

**Key insight**: NanoClaw proves that OS-level isolation is the right security primitive for agents. But it has no cross-channel identity, no structured memory beyond SQLite + flat files, no memory consolidation, and no concept of agent economics or resource accounting.

---

## TypeScript Agent Frameworks

### Mastra

- **Stars**: ~22k
- **Language**: TypeScript (from the Gatsby team, YC W25, $13M seed)
- **Architecture**: Framework for building agents, not a runtime. Monorepo (pnpm workspaces). Composable workflows with `.then()`, `.branch()`, `.parallel()`. 40+ LLM providers. MCP support. Deployed as library inside your app or as standalone server.
- **Multi-channel**: Not native. Designed for web/API integration, not messaging platform adapters.
- **Memory**: Three-tier model — the most sophisticated in the landscape:
  - **Working memory**: Structured scratchpad (user preferences, goals). Resource-scoped or thread-scoped.
  - **Semantic recall**: RAG-based vector search across all threads for a user. Retrieves relevant past messages.
  - **Observational memory**: Compresses raw history + tool results into dense observation logs. Reduces context size while preserving coherence. Positioned as the primary memory system going forward.
- **Security**: Apache 2.0 core + enterprise licensing. No agent-level security model (no sandboxing, no threat gating on memory writes).
- **Extensibility**: Model routing, custom tools, MCP servers, workflow composition. Well-designed extension points.

**Key insight**: Mastra's memory architecture (working + semantic + observational) is the closest to what we're building. But it has no security model, no channel adapters, and no concept of agent identity beyond configuration.

### Vercel AI SDK (v6)

- **Stars**: High (20M+ monthly npm downloads)
- **Language**: TypeScript
- **Architecture**: Provider-agnostic toolkit, not a framework. Agent is an interface, not a class. `ToolLoopAgent` as default implementation. ReAct pattern, tool calling, multi-step reasoning.
- **Multi-channel**: Not applicable — it's a building block, not a runtime.
- **Memory**: None built-in. Delegates to application layer.
- **Security**: None at the agent level.
- **Extensibility**: Extremely — it's designed to be composed into other systems.

**Key insight**: We already use this (AI SDK v6). It's the right base layer. Provides LLM abstraction and streaming. Everything above it (memory, security, channels, identity) is our job.

### LangGraph.js

- **Stars**: ~8k (JS version); Python version ~18k
- **Language**: TypeScript/JavaScript
- **Architecture**: Graph-based agent orchestration. Directed graphs with nodes (agents/functions), edges (data flow), and a centralized StateGraph. Supports conditional edges, parallel execution, subgraphs.
- **Multi-channel**: None native.
- **Memory**: Checkpoint-based persistence. MemorySaver (in-memory), SqliteSaver (local), PostgresSaver (production). State snapshots at every step, organized into threads. Cross-thread memory possible via shared stores.
- **Security**: None at the agent level.
- **Extensibility**: Subgraphs are reusable. Good for complex multi-agent workflows. LangSmith for observability ($39/seat/month for production).

**Key insight**: Graph-based orchestration is powerful for complex workflows but adds conceptual overhead for simple agent loops. The checkpoint model is solid for state recovery but doesn't provide memory consolidation or semantic recall. Vendor lock-in risk via LangSmith.

### CrewAI

- **Stars**: ~30k+
- **Language**: Python (no TypeScript version)
- **Architecture**: Role-based multi-agent orchestration. Two modes: Crews (autonomous teams with delegation) and Flows (event-driven pipelines). Built from scratch, no LangChain dependency.
- **Multi-channel**: None.
- **Memory**: Short-term, long-term, and entity memory. RAG integration.
- **Security**: None at the agent level.
- **Extensibility**: Custom agents, tools, and workflows. Good high-level abstractions.

**Key insight**: Python-only, so not directly relevant to our stack. But the Crews/Flows dual architecture (autonomous vs. deterministic) is a pattern worth noting — our orchestrator already does something similar with threat-score-based routing override.

### Microsoft Agent Framework (AutoGen successor)

- **Stars**: ~40k (combined AutoGen ecosystem)
- **Language**: Python and .NET primarily; TypeScript planned
- **Architecture**: Async event-driven messaging. Agents communicate via messages. Pluggable components (agents, tools, memory, models). OpenTelemetry observability. GA targeting Q1 2026.
- **Multi-channel**: Not native — designed for enterprise orchestration.
- **Memory**: Pluggable. No default structured memory.
- **Security**: Enterprise-grade in theory (Azure integration), but not at the individual agent level.

**Key insight**: Enterprise-focused, heavy. The async messaging pattern is sound. TypeScript story is immature.

### Other Notable Entries

| Framework | Stars | Language | Note |
|-----------|-------|----------|------|
| OpenAI Agents SDK (JS) | ~2k | TypeScript | Lightweight, multi-agent, voice agents. New. |
| Google ADK (TypeScript) | New | TypeScript | Code-first, just launched. |
| VoltAgent | Growing | TypeScript | LLM observability built into core. |
| Strands (AWS) | New | TypeScript | Model-driven, lightweight, browser-compatible. |

---

## Pattern Analysis

### Patterns to Adopt

1. **OS-level isolation (NanoClaw)**. Container-per-agent is the right security primitive. Application-level permission checks are insufficient — OpenClaw proved this catastrophically. Our SubstrateMonitor subsystem should be aware of its container boundaries.

2. **SOUL.md as identity anchor (OpenClaw)**. A plaintext identity file read on every boot is elegant and auditable. We already have SOUL.md. The pattern is validated at massive scale. Extend it: our SOUL.md is load-bearing (amygdala grounds alignment against it), not just a system prompt prefix.

3. **Three-tier memory (Mastra)**. Working memory + semantic recall + observational compression maps cleanly to our brain-inspired subsystems:
   - Working memory = hippocampal short-term buffer
   - Semantic recall = hippocampal long-term retrieval
   - Observational compression = consolidation (our Consolidator subsystem)
   Mastra validates the pattern. We add threat-gated writes (amygdala), conflict detection (ACC), and cross-channel provenance — none of which Mastra has.

4. **Channel adapter registry (NanoClaw)**. Self-registering channel adapters with a common interface. Clean separation between channel transport and agent logic. Our Router subsystem should follow this pattern.

5. **Graph-based orchestration for complex flows (LangGraph)**. When deterministic multi-step workflows are needed, a graph representation is clearer than imperative code. Our orchestrator's routing logic already resembles this. Consider making it explicit for complex tool chains.

6. **Checkpoint persistence (LangGraph)**. State snapshots at every step enable replay, debugging, and recovery. We already do this with step traces in the arena. Generalize it to all agent interactions.

### Anti-Patterns to Avoid

1. **Application-level security as the primary boundary (OpenClaw)**. Pairing codes, allowlists, and permission checks running in the same process as the agent. One vulnerability = total compromise. 42k exposed instances, 20% malicious skills. Never trust the agent process to enforce its own constraints.

2. **Monolithic gateway (OpenClaw)**. 500k lines, 70+ dependencies, one process handling everything. Audit surface is enormous. NanoClaw's 500-line core is auditable; OpenClaw's is not.

3. **No cross-channel identity (NanoClaw)**. Each group is a silo. A user on WhatsApp and the same user on Discord are strangers. For our non-profit use case (same veteran using SMS and Discord), this is a hard requirement. NanoClaw punts on it entirely.

4. **Memory as flat files only (NanoClaw, OpenClaw)**. CLAUDE.md per group, no structured retrieval, no semantic search, no consolidation. Fine for a personal assistant; insufficient for an agent that needs to build a world model of the people it serves.

5. **Plugin marketplaces without supply-chain security (OpenClaw ClawHub)**. 20% malicious rate. Any extensibility model that accepts arbitrary code from the community needs cryptographic verification, sandboxed execution, and audit trails. Our thermodynamic ledger can help here — staking on skill trustworthiness.

6. **Vendor lock-in via observability (LangGraph/LangSmith)**. Free tier is 5k traces/month. Production requires $39/seat/month. Observability is too important to outsource. Build it in from day one (we already do this).

7. **Framework without opinion on identity (Mastra, LangGraph, Vercel AI SDK)**. Memory without identity is just a database. These frameworks let you store state but have no concept of who the agent IS. Identity is configuration, not architecture. For us, identity is structural — the amygdala can't function without it.

### Gaps Our Approach Fills

**No framework in the landscape combines these properties:**

1. **Identity as architecture, not configuration.** OpenClaw's SOUL.md is a system prompt prefix. Our SOUL.md is the ground truth the amygdala reasons against. Identity isn't decorative — it's the compression bottleneck through which all security reasoning passes. The amygdala layer (guardian) doesn't pattern-match attacks; it detects misalignment against a structural identity. No other framework has this.

2. **Threat-gated memory writes.** Mastra has the best memory model in the landscape, but any agent can write anything to memory at any time. Our 4-band threat gating (<0.3 full access, 0.3-0.5 elevated uncertainty, >=0.5 blocked, >=0.8 refusal) means a socially-engineered agent can't poison its own memory. No other framework gates memory writes by threat level.

3. **Thermodynamic economics.** No framework has an energy model. Agents can make unlimited tool calls, spawn unlimited subagents, consume unlimited context. There's no concept of cost, budget, or metabolic constraint. Our TigerBeetle ledger makes every decision visible as an energy transfer, every subsystem accountable for its spend, and death (budget exhaustion) is a real outcome. This is how you audit agent behavior for a non-profit that owes receipts to its community.

4. **Cross-channel identity with memory provenance.** NanoClaw has channels but no identity unification. Mastra has memory but no channels. OpenClaw has both channels and sessions but no structured memory or provenance tracking. We need: same person across channels = same identity, with every memory tagged by channel origin and consolidation path. The Consolidator subsystem handles this.

5. **Conflict detection (ACC).** When memories from different channels or sessions contradict each other, no framework detects this. They just store both. Our ACC (Anterior Cingulate Cortex) subsystem explicitly monitors for contradictions and flags them for resolution. Essential when the same person tells the WhatsApp agent one thing and the Discord agent another.

6. **Evolutionary validation of agent compositions.** 56 sessions of arena infrastructure — encounters, tournament selection, community fitness, niche preservation, dead lineage extraction. No other framework tests agent architectures through evolutionary pressure. This is how we know our subsystem contracts actually produce fit agents, not just plausible ones.

7. **Substrate awareness as defense.** NanoClaw's containers keep threats out. Our SubstrateMonitor lets the agent see its own boundaries — resource limits, capabilities, channel constraints. The agent knows what it can and can't do, which informs the guardian's threat assessment. "Build the mirror, not the wall."

---

## Summary Table

| Dimension | OpenClaw | NanoClaw | Mastra | LangGraph.js | Vercel AI SDK | **Ours** |
|-----------|----------|----------|--------|-------------|---------------|----------|
| Stars | 332k | 25k | 22k | 8k | 20M+ dl/mo | -- |
| Multi-channel | 20+ | 5 | None | None | None | Target: 5+ |
| Identity model | SOUL.md (prompt prefix) | Per-group CLAUDE.md | None | None | None | SOUL.md (structural) |
| Memory | Session history | SQLite + flat files | Working + semantic + observational | Checkpoints | None | Hippocampal + threat-gated + cross-channel |
| Security | App-level (broken) | Container isolation | None | None | None | Container + amygdala + threat gating |
| Cross-channel ID | No | No | N/A | N/A | N/A | Yes (planned) |
| Agent economics | None | None | None | None | None | Thermodynamic ledger |
| Conflict detection | None | None | None | None | None | ACC subsystem |
| Extensibility | Skills/plugins | Fork + modify | Tools + MCP + workflows | Subgraphs | Composable | Subsystem contracts |

---

## Recommendations for Design Doc (af-09)

1. **Base layer**: Keep Vercel AI SDK v6 as the LLM abstraction. It's provider-agnostic, well-maintained, and we have 56 sessions of integration.

2. **Channel adapters**: Follow NanoClaw's self-registering registry pattern. Each adapter produces a canonical message type, consumes a canonical response type. The Router subsystem is the only code that knows about channels.

3. **Container isolation**: Adopt NanoClaw's model for tool execution. Agent reasoning can run in the main process; tool execution (especially bash, file access) runs in sandboxed containers. The SubstrateMonitor exposes container boundaries to the guardian.

4. **Memory architecture**: Adopt Mastra's three-tier model (working + semantic + observational) as the base, then layer our additions: threat-gated writes, cross-channel provenance, ACC conflict detection, and consolidation across channels.

5. **Identity**: Our SOUL.md is already stronger than OpenClaw's. The design doc should formalize the distinction: SOUL.md as ground truth for amygdala alignment reasoning, not just a prompt prefix.

6. **Economics**: No precedent in the landscape. The thermodynamic ledger is genuinely novel. Design it from first principles using TigerBeetle primitives (pending af-02 research).

7. **Don't build a plugin marketplace.** OpenClaw's ClawHub is a cautionary tale. If extensibility is needed, it should be through subsystem contracts with explicit interfaces, not arbitrary code injection.

Sources:
- [NanoClaw GitHub](https://github.com/qwibitai/nanoclaw)
- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [Mastra GitHub](https://github.com/mastra-ai/mastra)
- [LangGraph.js GitHub](https://github.com/langchain-ai/langgraphjs)
- [Vercel AI SDK](https://ai-sdk.dev/)
- [NanoClaw vs OpenClaw - The Register](https://www.theregister.com/2026/03/01/nanoclaw_container_openclaw/)
- [OpenClaw Security - The Hacker News](https://thehackernews.com/2026/03/openclaw-ai-agent-flaws-could-enable.html)
- [OpenClaw Security - Microsoft](https://www.microsoft.com/en-us/security/blog/2026/02/19/running-openclaw-safely-identity-isolation-runtime-risk/)
- [Mastra Memory Docs](https://mastra.ai/docs/memory/overview)
- [CrewAI GitHub](https://github.com/crewAIInc/crewAI)
- [OpenClaw Star History](https://www.star-history.com/blog/openclaw-surpasses-react-most-starred-software)
