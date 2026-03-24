# Agent Framework Comparison: Claude Agent SDK vs Vercel AI SDK v6 vs Raw API

**Date:** 2026-03-24
**Context:** Session 56.5 decided "Keep Vercel AI SDK (multi-provider, no lock-in). Don't couple to Claude Agent SDK." This research confirms or revises that decision.

---

## 1. Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)

**What it is:** Anthropic's official agent framework — the same agent loop, tools, and context management that power Claude Code, packaged as a library.

**Architecture:**
- Agent loop with multi-turn conversation, tool execution, and session management
- Built-in tools: file operations, shell commands, web search
- Native MCP integration — can host MCP servers and connect to external ones
- Subagents definable inline (not just filesystem-based)
- Session persistence and forking (branch conversations from a checkpoint)
- V2 interface removes async generators; each turn is a send()/stream() cycle
- Extended thinking support (Opus 4.6+)

**Lock-in:** Claude models only. No multi-provider support. You can access Claude through Bedrock/Vertex/Azure, but it's always Claude underneath.

**Opinionatedness:** High. It owns the agent loop, tool execution, session management, and context window. You get Claude Code's architecture as a library — powerful but prescriptive.

**What it does NOT do:**
- No custom tool schemas via Zod (uses its own tool definition format)
- No model-agnostic abstractions
- No frontend/streaming primitives for web apps

**Key insight for loopcommons:** The Claude Agent SDK is designed for autonomous agents that do work (edit files, run commands). Loopcommons already has its own agent loop (`createAgentCore`), its own tool system (`ToolPackage`), its own orchestration (amygdala → orchestrator → subagent), and its own session management. Adopting Claude Agent SDK would mean replacing all of that with Anthropic's opinionated version, losing the brain-inspired architecture that IS the research thesis.

## 2. Vercel AI SDK v6 (`ai` + `@ai-sdk/anthropic`)

**What it is:** Multi-provider TypeScript toolkit for AI-powered applications. Model-agnostic abstraction over 20+ providers.

**Architecture:**
- `generateText()` / `streamText()` — core LLM interaction primitives
- `Agent` abstraction (new in v6) — reusable agent with model, instructions, tools
- `ToolLoopAgent` — production agent loop (up to N steps of tool calling)
- Structured output via `generateObject()` / `streamObject()` with Zod schemas
- MCP client support via `experimental_createMCPClient()`
- SSE streaming, ReadableStream support built-in
- Provider-agnostic tool definitions

**Lock-in:** None. Swap providers by changing an import. Same code works with Anthropic, OpenAI, Google, Mistral, Bedrock, etc.

**Opinionatedness:** Medium. It provides primitives (generateText, streamText, tool definitions) but doesn't dictate your agent architecture. You can use its Agent abstraction or ignore it and build your own loop (which is what loopcommons does).

**Current usage in loopcommons:** The `AnthropicProvider` in `packages/llm/src/provider/anthropic.ts` wraps Vercel AI SDK's `generateText`/`streamText`/`tool` behind the project's own `Provider` interface. This is a thin, clean integration — Vercel AI SDK handles the HTTP/streaming/tool-format plumbing, while loopcommons owns everything above that.

## 3. Raw Anthropic API (`@anthropic-ai/sdk`)

**What it is:** Direct HTTP client for Anthropic's Messages API. Maximum control, minimum abstraction.

**Pros:** No intermediate abstractions. Direct access to every API feature the moment it ships. No dependency on Vercel's release cycle.

**Cons:**
- Must handle tool call formatting, streaming chunk parsing, retry logic, rate limiting manually
- Locked to Anthropic (same as Claude Agent SDK but without the agent primitives)
- Duplicates work that Vercel AI SDK already does well
- Every new Anthropic API feature requires manual integration

**Key insight:** The project's `Provider` interface is already thin enough that the Vercel AI SDK layer adds almost no conceptual overhead. Going raw would mean reimplementing streaming, tool formatting, and provider abstraction for negligible benefit.

## 4. MCP (Model Context Protocol)

**Spec status:** Current release is November 2025. No new version cut since, but active development continues through Working Groups and Spec Enhancement Proposals (SEPs).

**What it is:** An open standard for connecting LLM agents to external tools and data sources. Think "USB for AI tools" — define a tool once, any MCP-compatible client can use it.

**2026 state:**
- De facto standard for tool interop across providers
- OpenAI, Anthropic, Google all support MCP
- MCP Apps extension now live (tools can return interactive UI)
- Both Vercel AI SDK and Claude Agent SDK have MCP client support
- Registry and reference servers maintained by the ecosystem

**Relevance to loopcommons:**
- The project's `ToolPackage` interface is already a tool interop abstraction. MCP is the external-facing equivalent.
- When the agent framework goes multi-channel, MCP servers could expose loopcommons tools to external clients (other agents, IDE integrations, etc.)
- Vercel AI SDK's `experimental_createMCPClient()` means MCP tools can be consumed alongside native tools with no architecture change.
- MCP does NOT replace the internal tool system — it's a transport/discovery layer, not an orchestration layer.

---

## Can Claude Agent SDK and Vercel AI SDK Be Composed?

**Technically yes, practically no benefit for this project.**

- A community provider (`ai-sdk-provider-claude-code`) bridges Claude Agent SDK into Vercel AI SDK's interface, but it uses Claude's built-in tools (Bash, Edit, Read) — not custom Zod-schema tools.
- You could use Claude Agent SDK for a specific autonomous task (e.g., code generation agent) while using Vercel AI SDK for the main conversational agent. But this means maintaining two agent systems with different tool formats, session models, and abstractions.
- The value of Claude Agent SDK is its opinionated agent loop. Loopcommons already has a more sophisticated one (amygdala, threat scoring, memory gating, evolutionary selection). Adopting Claude Agent SDK would require either replacing the custom architecture or running two parallel agent systems.

---

## Recommendation

**Confirm the Session 56.5 decision: Keep Vercel AI SDK v6. Do not adopt Claude Agent SDK.**

Rationale:

1. **Vercel AI SDK is the right layer.** It handles the plumbing (HTTP, streaming, tool format normalization, provider abstraction) and stays out of the way for everything above. The project already uses it exactly this way — a thin provider wrapper behind a custom `Provider` interface.

2. **Claude Agent SDK solves the wrong problem.** It's designed for autonomous coding agents (Claude Code as a library). Loopcommons is building a brain-inspired agent with custom orchestration, evolutionary identity, and thermodynamic grounding. The Claude Agent SDK would replace the most interesting parts of the architecture with Anthropic's generic version.

3. **No lock-in.** Vercel AI SDK's multi-provider support means the project can add OpenAI, Google, or open-source models without architecture changes. This matters for the arena (testing agents across models) and for the multi-channel vision.

4. **MCP is complementary, not competing.** When the project needs external tool interop, MCP servers can be consumed through Vercel AI SDK's MCP client. The internal `ToolPackage` system remains the orchestration layer; MCP is the transport layer.

5. **The existing architecture is clean.** `Provider` interface → `AnthropicProvider` (wraps Vercel AI SDK) → `createAgentCore` (owns the agent loop). Adding a second provider (e.g., `OpenAIProvider`) is a single file. The abstraction boundary is in the right place.

**One thing to watch:** Vercel AI SDK v6's new `Agent` abstraction. If it matures into a production-quality agent loop with customizable middleware (pre/post hooks, routing), it could potentially simplify the `createAgentCore` implementation. Worth monitoring but not worth adopting yet — the custom architecture is doing things the generic abstraction can't (amygdala, threat-gated memory, evolutionary selection).

---

## Summary Table

| Dimension | Claude Agent SDK | Vercel AI SDK v6 | Raw Anthropic API |
|-----------|-----------------|-------------------|-------------------|
| Model lock-in | Claude only | 20+ providers | Anthropic only |
| Agent loop | Built-in, opinionated | Optional (`Agent`), or BYO | None — BYO |
| Tool system | Built-in + MCP | Zod-based + MCP client | Manual formatting |
| Streaming | Yes | Yes (SSE, ReadableStream) | Manual chunk parsing |
| Structured output | Yes (JSON Schema) | Yes (Zod → JSON Schema) | Yes (JSON Schema) |
| MCP support | Native (host + client) | Client (`experimental_`) | None |
| Session mgmt | Built-in (persist, fork) | None — BYO | None — BYO |
| Fit for loopcommons | Poor — replaces custom arch | Good — thin plumbing layer | Unnecessary complexity |

Sources:
- [Claude Agent SDK - GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
- [Agent SDK overview - Anthropic Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [Agent SDK TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [TypeScript SDK V2 Preview](https://platform.claude.com/docs/en/agent-sdk/typescript-v2-preview)
- [MCP in the Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/mcp)
- [@anthropic-ai/claude-agent-sdk on npm](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk)
- [AI SDK 6 - Vercel Blog](https://vercel.com/blog/ai-sdk-6)
- [AI SDK Documentation](https://ai-sdk.dev/)
- [MCP Specification (2025-11-25)](https://modelcontextprotocol.io/specification/2025-11-25)
- [2026 MCP Roadmap](http://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/)
- [Vercel AI SDK vs Claude Agent SDK - Medium](https://bertomill.medium.com/vercel-ai-sdk-vs-claude-agent-sdk-which-one-should-you-build-with-a88d2d6a4311)
- [ai-sdk-provider-claude-code - GitHub](https://github.com/ben-vargas/ai-sdk-provider-claude-code)
- [Vercel AI SDK MCP Security Blog](https://vercel.com/blog/generate-static-ai-sdk-tools-from-mcp-servers-with-mcp-to-ai-sdk)
