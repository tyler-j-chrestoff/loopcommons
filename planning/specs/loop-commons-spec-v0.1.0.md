# LOOP COMMONS

## Technical Specification

**Trace-Driven Agentic Research Platform**

Version 0.1.0 · March 2026
Tyler Lacy — Imaginary Foundation

*CONFIDENTIAL — DRAFT*

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Scope and Definitions](#2-scope-and-definitions)
3. [System Architecture](#3-system-architecture)
4. [Trace System Specification](#4-trace-system-specification)
5. [Agent Loop Specification](#5-agent-loop-specification)
6. [API Layer Specification](#6-api-layer-specification)
7. [Frontend Specification](#7-frontend-specification)
8. [Tool System](#8-tool-system)
9. [SDI Integration Surface](#9-sdi-integration-surface)
10. [Design Decisions and Rationale](#10-design-decisions-and-rationale)
11. [Status and Roadmap](#11-status-and-roadmap)
12. [Appendices](#12-appendices)

---

## 1. Executive Summary

Loop Commons is a trace-driven agentic research platform that serves as both production-grade research infrastructure and a technical showcase for observable AI agent design patterns. The platform generates high-quality training data from fully traced agent execution while making transparency a first-class architectural feature.

Every token consumed, tool call dispatched, and decision branch taken is captured as a typed trace event, streamed to the client in real-time via server-sent events (SSE), and rendered into an interactive inspection interface. This creates a closed feedback loop: agent execution produces the observability data that enables debugging, cost analysis, and downstream training data extraction.

This document specifies the architecture, data models, protocols, and integration surface of Loop Commons v0.1.0.

---

## 2. Scope and Definitions

### 2.1 Scope

This specification covers the following subsystems:

- The `packages/llm` agent engine: multi-round execution loop, tool binding, trace emission, cost tracking, and provider abstraction.
- The `packages/web` frontend and API layer: Next.js 16 chat endpoint, SSE streaming, React hooks, and the TraceInspector UI component.
- The Trace data model and TraceEvent protocol: typed event unions, round/tool execution schemas, and serialization format.
- Integration surface: extension points for additional providers, tool libraries, and training data export pipelines.

### 2.2 Definitions

| Term | Definition |
|------|------------|
| **Agent Loop** | The reactive multi-round execution cycle in `packages/llm` that orchestrates LLM calls, tool execution, and stop-condition evaluation. |
| **Trace** | The complete execution record of a single agent invocation, comprising all rounds, tool executions, token usage, and cost data. |
| **Round** | A single LLM call-response cycle within a trace, including any tool calls dispatched during that round. |
| **TraceEvent** | A typed union member emitted during agent execution; the atomic unit of observability. |
| **Collector** | An interface through which the agent loop emits TraceEvents; decouples emission from consumption. |
| **TraceInspector** | The React component that consumes SSE-streamed TraceEvents and renders round-by-round execution detail. |
| **Provider** | An abstraction over LLM inference backends (currently Anthropic Claude via Vercel AI SDK). |
| **Stop Condition** | The predicate that terminates the agent loop: either a text-only response or `maxRounds` exhaustion. |

---

## 3. System Architecture

### 3.1 Monorepo Structure

Loop Commons is organized as an npm workspaces monorepo with strict separation between the agent engine and the presentation layer. This separation is a deliberate architectural constraint: the `llm` package carries zero UI dependencies and is independently testable, deployable, and embeddable.

| Package | Responsibility | Dependencies |
|---------|---------------|--------------|
| `packages/llm` | Agent loop, tool binding, trace emission, cost tracking, provider abstraction | `ai` v6, `@ai-sdk/anthropic` v3, `zod` |
| `packages/web` | Next.js 16 App Router, chat API route, SSE streaming, TraceInspector UI | `next` 16, `react`, `tailwind` v4, `packages/llm` |

### 3.2 Data Flow

The end-to-end data flow for a single user interaction follows a linear pipeline:

```
User Message
    |
    v
HTTP POST /api/chat
    |
    v
Agent Loop (packages/llm)
    |  +-- LLM Call ----------------+
    |  |  Tool Execution(s)         |
    |  |  Append to History         |
    |  +-- Evaluate Stop -----------+
    |
    v
Typed TraceEvents (via Collector)
    |
    v
SSE Stream (HTTP Response)
    |
    v
React useChat Hook -> TraceInspector UI
```

### 3.3 Technology Stack

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| Runtime Framework | Next.js 16 (App Router, Turbopack) | Fast builds, SSE support, edge-compatible routing |
| Language | TypeScript 5.7 (strict mode) | Compile-time guarantees for trace type safety; training data correctness |
| Styling | Tailwind CSS v4 (CSS-native config) | Dark theme, rapid iteration, no runtime CSS overhead |
| LLM Inference | Anthropic Claude Haiku 4.5 | Cost-effective reasoning; no function-calling limitations |
| LLM SDK | Vercel AI SDK v6 + @ai-sdk/anthropic v3 | Provider abstraction via `LanguageModel` type; smooth streaming |
| Schema Validation | Zod | Runtime validation of tool arguments and trace events |
| Testing | Vitest | Fast, TypeScript-native; currently `llm` package; web tests planned |
| Monorepo | npm workspaces | Zero-config dependency linking between packages |

---

## 4. Trace System Specification

The trace system is the architectural centerpiece of Loop Commons. It captures the complete execution genealogy of every agent invocation as a structured, typed data model. Tracing is not bolted onto the loop; it is intrinsic to it. Every decision point, tool dispatch, and cost calculation emits an event through the Collector interface.

### 4.1 Trace Data Model

The root `Trace` object is the complete record of a single agent execution:

```typescript
interface Trace {
  id: string;                    // Unique trace identifier
  model: string;                 // Model name (e.g., 'claude-haiku-4-5')
  provider: string;              // Provider key (e.g., 'anthropic')
  config: AgentConfig;           // Resolved agent configuration
  rounds: Round[];               // Ordered sequence of execution rounds
  totalUsage: TokenUsage;        // Aggregated token counts
  totalCost: number;             // Aggregated USD cost
  status: TraceStatus;           // 'running' | 'complete' | 'error'
}
```

#### 4.1.1 Round

Each `Round` captures a single LLM call-response cycle within the trace:

```typescript
interface Round {
  number: number;                // 1-indexed round ordinal
  request: ChatMessage[];        // Messages sent to the LLM
  response: {
    role: 'assistant';
    content: string;             // Text response content
  };
  toolCalls: ToolCall[];         // Tool invocations from this round
  toolExecutions: ToolExecution[];
  usage: TokenUsage;
  cost: number;                  // USD cost for this round
  timing: {
    start: number;               // Unix timestamp (ms)
    end: number;
    duration: number;            // Elapsed ms
  };
  rawProviderResponse?: unknown; // Server-side only; stripped from SSE
}
```

#### 4.1.2 ToolCall and ToolExecution

```typescript
interface ToolCall {
  id: string;                    // Provider-assigned call ID
  name: string;                  // Registered tool name
  arguments: Record<string, unknown>;
}

interface ToolExecution {
  toolName: string;
  input: Record<string, unknown>;
  output: unknown;
  error?: string;
  timing: {
    start: number;
    end: number;
    duration: number;
  };
}
```

#### 4.1.3 TokenUsage

```typescript
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
}
```

### 4.2 TraceEvent Protocol

TraceEvents form a typed discriminated union emitted in strict temporal sequence during agent execution. Each event carries sufficient context for the consumer to reconstruct execution state without maintaining separate bookkeeping.

| Event Type | Payload | Emitted When |
|-----------|---------|-------------|
| `round:start` | `{ roundNumber: number }` | A new LLM call begins |
| `round:complete` | `{ round: Round }` | LLM has responded; tool calls (if any) resolved |
| `tool:start` | `{ toolName: string, input: Record<string, unknown> }` | A tool execution begins |
| `tool:complete` | `{ execution: ToolExecution }` | A tool execution finishes (success or error) |
| `trace:complete` | `{ trace: Trace }` | The full agent run has terminated |

#### 4.2.1 Collector Interface

The Collector is the abstraction through which the agent loop emits TraceEvents. It decouples event production from consumption, allowing multiple sinks (SSE stream, log file, training data pipeline) to attach independently.

```typescript
interface TraceCollector {
  emit(event: TraceEvent): void;
}
```

#### 4.2.2 SSE Serialization

TraceEvents are serialized as JSON and streamed to the client via server-sent events. Each SSE frame carries a single TraceEvent:

```
event: trace
data: { "type": "round:start", "roundNumber": 1 }

event: trace
data: { "type": "tool:start", "toolName": "search", "input": {...} }
```

The client's `useChat` React hook consumes these frames and incrementally builds the Trace object for the TraceInspector component.

---

## 5. Agent Loop Specification

The agent loop is located at `packages/llm/src/agent/loop.ts` and implements a reactive multi-round execution cycle. It is the only component that directly orchestrates LLM calls, tool dispatch, and stop-condition evaluation.

### 5.1 Execution Cycle

Each invocation of the agent loop proceeds through the following phases:

- **Phase 1 -- LLM Call:** Send the accumulated conversation history and the set of available tools to the configured LLM provider. The provider returns a response that may contain text, tool calls, or both.
- **Phase 2 -- Tool Execution:** If the response includes tool calls, execute them. Independent tool calls are parallelized; sequential dependencies are declared in tool definitions, not enforced by the loop.
- **Phase 3 -- Append and Loop:** Append tool results to conversation history. Return to Phase 1.
- **Phase 4 -- Termination:** The loop exits when a stop condition is met (see 5.2).

### 5.2 Stop Conditions

| Condition | Behavior |
|-----------|----------|
| Text-only response | The LLM responds with text content and zero tool calls. The loop terminates normally. |
| `maxRounds` exhaustion | The configured maximum round count is reached. The loop makes one final LLM call with tools removed, forcing a text synthesis response. This is graceful degradation, not an error. |

### 5.3 Cost Tracking

Cost is a first-class citizen. Per-round pricing is calculated using model-aware rate tables. Token counts are clamped to non-negative values to handle provider response quirks (some providers occasionally report negative cache token counts). Costs aggregate at the Trace level for total invocation accounting.

### 5.4 Provider Abstraction

The `resolveProvider()` function maps model name strings to Vercel AI SDK `LanguageModel` implementations. This allows the loop to remain provider-agnostic; swapping from Claude to another provider requires only a new entry in the provider registry, not changes to loop logic.

---

## 6. API Layer Specification

### 6.1 Chat Endpoint

| Property | Value |
|----------|-------|
| Route | `POST /api/chat` |
| Content-Type (Request) | `application/json` |
| Content-Type (Response) | `text/event-stream` |
| Auth | None (v0.1.0; auth planned for hosted deployment) |

#### 6.1.1 Request Schema

```typescript
interface ChatRequest {
  messages: ChatMessage[];       // Conversation history
  model?: string;                // Override default model
  maxRounds?: number;            // Override default max rounds
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}
```

#### 6.1.2 Response Format

The response is an SSE stream. Each frame carries a single TraceEvent serialized as JSON (see 4.2.2). The stream terminates after the `trace:complete` event is emitted. Clients should handle stream interruption gracefully, as partial traces are valid for debugging.

---

## 7. Frontend Specification

### 7.1 useChat Hook

The `useChat` React hook is the client-side counterpart of the SSE stream. It manages connection lifecycle, event parsing, and incremental Trace object construction.

### 7.2 TraceInspector Component

The TraceInspector renders the live-updating Trace object into an interactive sidebar. It provides the following views:

- **Round-by-round breakdown:** messages sent, tool calls dispatched, outputs received, and timing for each round.
- **Timeline visualization:** a temporal view of round and tool execution durations, enabling identification of latency bottlenecks.
- **Cost aggregation:** per-round and total cost display with token-level granularity.
- **Token usage tracking:** input, output, cache creation, and cache read token counts per round and in aggregate.

The TraceInspector supports a meta-observability property: the agent can introspect its own trace while simultaneously generating the trace that proves it works. This is not theoretical; it is an active design goal for self-improving agent architectures.

---

## 8. Tool System

### 8.1 Tool Registration

Tools are registered with the agent loop as typed objects conforming to the following interface:

```typescript
interface ToolDefinition {
  name: string;                  // Unique tool identifier
  description: string;           // LLM-facing description
  parameters: ZodSchema;         // Zod schema for argument validation
  execute: (args: unknown) => Promise<unknown>;
}
```

### 8.2 Execution Semantics

- **Argument validation:** Tool arguments are validated against the Zod schema before execution. Validation failures are returned to the LLM as tool error results, not thrown as exceptions.
- **Parallelization:** When a round produces multiple tool calls with no declared dependencies, they execute concurrently via `Promise.all`. This reduces round latency for independent operations.
- **Error handling:** Tool execution errors are captured in the `ToolExecution.error` field and returned to the LLM as structured error results. The loop does not terminate on tool errors; the LLM decides how to proceed.
- **Timing:** Every tool execution is individually timed (start, end, duration) and emits `tool:start` and `tool:complete` TraceEvents.

---

## 9. SDI Integration Surface

Loop Commons is designed as a potential integration target for Sovereign Data Infrastructure (SDI) protocols. While the v0.1.0 release does not include native SDI support, the architecture exposes several natural integration points.

### 9.1 Traces as Capsules

The Trace data model maps directly onto SDI Capsule semantics. A completed Trace is an immutable, content-addressable unit of knowledge: it has a unique identifier, typed content, and a verifiable execution history. Traces can be serialized as IPLD/DAG-CBOR envelopes with CID addressing, making them natively addressable within the SDI content layer.

**Mapping:**

| Trace Concept | SDI Capsule Concept |
|--------------|-------------------|
| `Trace.id` | CID (content-addressed identifier) |
| `Trace.rounds` | Capsule content body (canonical RDF or structured payload) |
| `Trace.totalUsage` + `Trace.totalCost` | Capsule metadata envelope |
| `Trace.status` | Capsule lifecycle state |
| `TraceEvent[]` (ordered) | Capsule provenance chain |

### 9.2 Trace History as Commit DAG

A sequence of Traces from a single conversation session forms a natural commit chain. Each Trace references its predecessor (the prior conversation state), creating a temporal DAG that is structurally identical to SDI's commit model. Branch pointers can represent conversation forks, enabling versioned exploration of agent reasoning paths.

### 9.3 Cryptographic Identity

The Collector interface is the natural injection point for cryptographic attestation. An SDI-aware Collector implementation could sign each TraceEvent with the emitting agent's Ed25519 key, producing verifiable provenance chains. This transforms Loop Commons traces from debugging artifacts into cryptographically attested execution records -- suitable for use as training data with provenance guarantees.

```typescript
// Hypothetical SDI-aware Collector
interface AttestingCollector extends TraceCollector {
  emit(event: TraceEvent): void;  // Signs event with agent's Ed25519 key
  getAttestationChain(): SignedEvent[];
  exportCapsule(): DagCborEnvelope;
}
```

The RCE (Recursive Capsule Envelope) safety model from SDI Spec 0.1 applies directly: each attested TraceEvent is an RCE envelope, and the L=B admission gate can validate that trace content conforms to declared behavioral boundaries before capsule finalization.

### 9.4 Federation

The SSE streaming protocol can be extended to emit trace events across SDI relay infrastructure. A federated deployment would allow multiple Loop Commons instances to share traces via gossip protocol, enabling distributed agent research without centralized data aggregation. The right-to-exit property is preserved: traces are sovereign to their originating instance and can be exported or revoked independently.

### 9.5 Training Data Sovereignty

The combination of 9.1-9.4 produces a training data pipeline with properties that centralized platforms cannot offer: content-addressed integrity (traces are tamper-evident), cryptographic provenance (every token is attributable to a signed agent identity), temporal verifiability (the commit DAG proves ordering), and sovereign ownership (the originating instance controls access, export, and revocation). This is the SDI value proposition applied to the specific domain of agentic training data generation.

---

## 10. Design Decisions and Rationale

### 10.1 Trace-First Observability

Observability is not instrumentation added after the fact; it is the primary architectural driver. The trace system was designed first, and the agent loop was built to emit into it. This inversion means that trace coverage is total by construction, not by discipline. Every code path through the loop produces a TraceEvent. There are no unobserved branches.

### 10.2 Real-Time Streaming

SSE was chosen over WebSocket for trace delivery because the communication pattern is unidirectional (server to client) and the protocol degrades gracefully through proxies, CDNs, and edge runtimes. Users observe the agent thinking in real-time, not just the final answer. This builds trust in agentic systems by making cognition visible.

### 10.3 Cost as Architecture

Cost tracking is not an analytics feature; it is a research primitive. By making token economics visible at the round level, Loop Commons enables quantitative study of cost/quality trade-offs in agentic strategies. Different tool configurations, system prompts, and model choices produce measurably different cost profiles, and the trace system captures all of them.

### 10.4 Strict TypeScript

The TraceEvent discriminated union ensures that invalid event states are unrepresentable at the type level. This is critical for a system whose primary output is training data: type errors in trace generation would propagate as data quality issues downstream. Strict mode catches these at compile time.

### 10.5 Monorepo with Isolation

The agent engine (`packages/llm`) is decoupled from the presentation layer (`packages/web`). This isn't organizational preference -- it's a deployability constraint. The `llm` package must be embeddable in contexts that have no UI: CLI tools, batch processing pipelines, CI environments, and (critically for SDI integration) headless agent nodes in a federated mesh. Zero UI dependencies makes this possible without shimming or tree-shaking.

---

## 11. Status and Roadmap

### 11.1 Operational (v0.1.0)

- Multi-round agentic loop with parallel tool execution
- Real-time trace streaming via SSE with typed events
- Full per-round and aggregate cost accounting
- Claude Haiku 4.5 integration via Vercel AI SDK v6
- Next.js 16 frontend with dark theme and TraceInspector sidebar
- Vitest coverage for `llm` package

### 11.2 Planned

- Web package unit test coverage
- Hosting infrastructure and deployment pipeline
- Training data export pipeline (Trace -> structured dataset)
- Additional tool libraries (file I/O, code execution, web search)
- Multi-model benchmarking harness
- SDI Capsule serialization for trace export (see 9)
- Authentication and rate limiting for hosted deployment
- `AttestingCollector` implementation for cryptographic trace signing
- Relay-based trace federation for distributed research

---

## 12. Appendices

### A. Full Type Definitions

The canonical type definitions for the trace system are maintained in `packages/llm/src/types.ts`. The interfaces listed in 4 and 8 are simplified for specification clarity; the source of truth is the TypeScript source.

### B. Model Rate Table

| Model | Input ($/1M tokens) | Output ($/1M tokens) | Cache Write ($/1M) | Cache Read ($/1M) |
|-------|---------------------|----------------------|--------------------|--------------------|
| `claude-haiku-4-5` | $1.00 | $5.00 | $1.25 | $0.10 |

Additional model rates will be added to the `MODEL_RATES` registry as providers are onboarded.

### C. References

- Vercel AI SDK v6 Documentation: https://sdk.vercel.ai/docs
- Anthropic API Reference: https://docs.anthropic.com
- Next.js 16 App Router: https://nextjs.org/docs
- SDI Spec 0.1 (Sovereign Data Infrastructure): Internal -- Imaginary Foundation
