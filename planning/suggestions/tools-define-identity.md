# Suggestion: Tools Define Identity (OOO-Derived System Prompts)

**Source**: user conversation (session 23 planning), 2026-03-18
**Relates to**: evolutionary-agent-arena, agent-memory, auto-calibration, subagent registry
**Status**: Partially promoted — ToolPackage interface in [memory-packages](../milestones/memory-packages/) milestone. Derived system prompts remain Phase 3.

## Core Insight

System prompts should be **derived from tool composition**, not hand-written. An agent's identity is constituted by its capabilities (tools + memory + routing position), not by what you tell it to be. The system prompt is a natural-language projection of the tool set.

This is Object-Oriented Ontology (OOO) applied to agent design: objects are defined by their relations and capacities, not by essential inner nature. The agent IS its tools.

## Why This Matters

1. **Arena necessity**: You can't hand-write system prompts for randomly composed agents. Prompt generation from tool composition is required for evolutionary selection to work.
2. **Correctness**: Hand-written prompts can drift from actual capabilities. Derived prompts are always accurate — the prompt IS the capability description.
3. **Calibration reframing**: Auto-calibration doesn't optimize prompt text — it optimizes tool selection. The prompt follows.
4. **Security reframing**: The amygdala's job becomes "is this request within this agent's ontological boundary?" — a capability check derived from tool access, not a content check against hand-written rules.

## What Already Exists

- Subagent configs in `registry.ts` — each has a system prompt fragment paired with scoped tools. This is the manual version of the pattern.
- `createScopedRegistry()` — tool access is already the primary behavioral constraint.
- Amygdala has no tools → identity as pure reasoning layer. This is tool-defined identity in practice.
- Blog-reader vs blog-writer — same agent, different tools, different behavior. Auth-deterministic routing.

## What This Would Add

- A `generateSystemPrompt(tools: Tool[], memory?: AgentMemory, role?: string)` function that produces a system prompt from a tool set
- Tool metadata enrichment: each tool declares not just schema but intent, cost characteristics, and boundary constraints
- Orchestrator uses generated prompts instead of static configs
- Calibration loop optimizes tool selection, prompt generation follows automatically

## Connection to OOO

In OOO, objects "withdraw" — you never access the real object, only its relational surface. The system prompt is the relational surface of the agent. The agent's "real" identity is the tool composition + memory state, which is never fully expressible in a prompt. The prompt is always a lossy compression of the agent's capabilities — and that compression IS the variational bottleneck again.

## Prerequisites

- Agent memory milestone (memory is part of the capability set)
- Tool metadata enrichment (tools need richer self-description)
- Evolutionary arena (the forcing function that makes hand-written prompts impossible)

## When to Promote

After agent-memory. This could be a small story within a tools-as-packages milestone, or it could be the organizing principle for the arena milestone. The insight should inform agent-memory design now — memory types and recall strategies are capabilities that shape identity.
