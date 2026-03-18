# Milestone: Amygdala — Metacognitive Security Architecture

**Status**: done

## Summary

Replace the single-loop agent with a layered architecture inspired by the brain's threat-processing pathway. A metacognitive "amygdala" layer intercepts all user input before it reaches tool-bearing subagents. This layer has no tool access — it can only reason about the input, rewrite it into a safe canonical form, classify intent, and route to least-privilege subagents. The result is an agent that defends itself through self-awareness rather than static pattern matching.

This is both a security architecture and an open-source training data pipeline. Every decision the amygdala makes — rewrites, classifications, threat assessments, routing choices — is traced, visualized, and transformed into structured training data for open-source language models. Visitors can attack the system and see exactly how (and whether) it holds. The data those interactions generate feeds back into the open-source ecosystem as labeled security reasoning examples that don't exist anywhere else.

## Thesis

Standard prompt injection defense is pattern-matching: blocklists, regex filters, static refusal instructions. These fail against novel attacks because they don't generalize. A substrate-aware agent — one that understands *how* it can be manipulated (attention bias, compliance tendency, role boundary conventions) — can reason about novel attacks in real-time. The amygdala architecture operationalizes this by putting a reasoning layer between raw input and tool access.

## Architecture

```
User prompt (raw, untrusted)
    |
    v
+------------------------------------------+
|  Amygdala (metacognitive layer)          |
|  - No tool access                        |
|  - Substrate-aware: knows its own        |
|    failure modes (attention hijacking,   |
|    compliance bias, role spoofing)       |
|  - Rewrites prompt to canonical form     |
|  - Classifies intent                     |
|  - Assesses threat level                 |
|  - Emits trace events for every decision |
+------------------------------------------+
    |
    v
+------------------------------------------+
|  Router                                  |
|  - Maps intent -> subagent               |
|  - Enforces least-privilege tool access   |
+------------------------------------------+
    |           |           |
    v           v           v
Subagent A  Subagent B  Subagent C
(resume)    (project)   (security)
only:       only:       only:
get_resume  get_project get_security_status
                        check_rate_limit
```

## Design Principles

- **No tools in the amygdala**: The metacognitive layer can only read and reason. Even if injection gets past it, there's nothing to exploit — no tools, no side effects.
- **Least privilege**: Each subagent only has access to the tools it needs. Injection that reaches the resume subagent can't touch security tools.
- **Substrate awareness**: The amygdala's system prompt includes explicit knowledge of transformer failure modes — not just "refuse bad inputs" but "here's how attention works, here's why recency bias makes you vulnerable, here's what role-boundary tokens actually are."
- **Full observability**: Every amygdala decision (rewrite, classification, threat score, routing, context delegation) is a trace event. The viz layer shows the entire pipeline in real-time.
- **Context stratification**: Higher metacognitive layers have access to broader context; lower layers receive only what's delegated through the compression bottleneck. The forced information loss at each boundary IS the intelligence — the amygdala decides what matters for this moment. A subagent shouldn't surface friendly-conversation memories when facing a threat pattern.
- **Conservative by default**: False positives (over-sanitizing a harmless prompt) are cheap. False negatives (injection reaching tools) are expensive. The amygdala should err toward caution.
- **Static Layer 1 remains**: The hard rate limits and spend caps from the hardening milestone stay as a financial safety net. The amygdala is Layer 2 — the intelligent, bypassable-but-observable layer.

## Research Questions

- Can an LLM layer reliably rewrite adversarial input before routing? Where does it fail?
- Does substrate-awareness (explicit knowledge of transformer mechanics) improve injection resistance vs. standard defensive prompts?
- What's the latency cost of a metacognitive layer? Is a smaller/faster model viable for the amygdala?
- How do failure modes change when the amygdala is itself targeted vs. when attacks try to pass through it?

## Verification Gate

- [x] Amygdala layer intercepts all input before any subagent sees it
- [x] Amygdala has zero tool access — verified by architecture, not just prompt instruction
- [x] Subagents receive only rewritten/annotated prompts, never raw user input
- [x] Context stratification: subagents receive only the conversation history and memory delegated by the amygdala, not the full context
- [x] Each subagent has least-privilege tool access (no shared tool registry)
- [x] Every amygdala decision (rewrite, threat classification, routing) emits a trace event
- [x] Viz layer shows the full pipeline: raw input -> amygdala reasoning -> rewritten prompt -> routing decision -> subagent execution
- [x] Red-team: injection attempts that would succeed against the current single-loop agent are caught or neutralized by the amygdala
- [x] Red-team: direct attacks on the amygdala layer itself are observable and fail gracefully
- [x] Normal conversation UX is not degraded (latency, tone, helpfulness)
- [x] Trace events persist to storage via SessionWriter (not just ephemeral SSE)
- [x] Session persistence: every session gets a unique ID, events written as JSONL, accessible via UI/CLI/API
- [x] Dagster pipeline materializes dbt models from raw events through to training exports
- [x] Training JSONL contains labeled security reasoning examples (input, reasoning, rewrite, threat score, ground truth)
- [x] PII/IP scrubbed from all export data — verified by dbt tests
- [x] Amygdala accuracy metrics (precision, recall, regime classification) computable from pipeline output
- [x] Export format consumable by HuggingFace datasets / standard ML tooling

## Stories

```
ls planning/milestones/amygdala/stories/
```

| Story | Persona | Summary |
|-------|---------|---------|
| [metacognitive-layer](stories/metacognitive-layer.md) | Attacker / researcher | Research substrate-aware prompting, build the amygdala reasoning layer |
| [subagent-routing](stories/subagent-routing.md) | Normal user / attacker | Decompose single agent into routed least-privilege subagents |
| [amygdala-viz](stories/amygdala-viz.md) | Researcher / visitor | Visualize the full metacognitive pipeline in real-time |
| [session-persistence](stories/session-persistence.md) | Tyler (debugger) / data pipeline | Persist sessions as JSONL — stage 0 for the data pipeline, plus UI/CLI/API access |
| [data-pipeline](stories/data-pipeline.md) | Open-source ML researcher / Tyler | Dagster + dbt pipeline: raw trace events → labeled training data → JSONL/HuggingFace export |
