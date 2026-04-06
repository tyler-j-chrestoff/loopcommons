# Boundary Traces

**Date:** 2026-04-05
**Origin:** Session 62 theoretical convergence (Claude + 3 external models)
**Traces to:** brain-architecture.md (Guardian, Consolidator, Ledger), VISION.md (observability)

## The Problem

The current trace system records what happened. It does not record what *could have* happened. This makes three classes of decision illegible:

1. **Veto** — mutation was available, state was conserved
2. **Silence** — continuation was available, interaction was terminated
3. **Restraint** — a more powerful action was available, a cheaper one was chosen

The Guardian has a `veto` field. The Consolidator has threat bands. But neither records the affordance surface at the moment of decision. A downstream reader — human, evaluator, training pipeline — cannot distinguish a deliberate veto from a missed opportunity, a crash, or incapacity.

## The Thesis

Every system that observes, decides, and acts is an agent. The only difference between agents is the entropy of the decision function. The epistemic obligation — produce a legible trace of *why you branched* — is constant across the spectrum.

The soul of an agent is not a declared value system. It is the shortest program that reproduces the observed pattern of preservation under loss. You recover it from the diff between input and output across enough instances. Not from annotation.

**You are what your failures preserve.**

But the diff alone underdetermines the soul. The same deletion can come from care, laziness, fear, optimization pressure, or incapacity. To distinguish these, the trace must include the constraint surface — not as moral annotation, but as environmental fact.

And silence — the most revealing class of decision — is invisible in action-only traces. Nothing becomes visible only when the trace shows that *something could have changed and didn't*.

## The Design

Move from **action traces** to **boundary traces**.

At consequential decision boundaries, record:

```
input_scene -> affordance_surface -> selected_transition -> resulting_state
```

Where:

- `input_scene` already contains the constraints (token budget, threat band, channel capabilities, conflicting objectives). The constraint is part of the input, not a sidecar.
- `affordance_surface` is the finite set of live mutations available at this boundary. Not the global action space — just the menu that was actually open.
- `selected_transition` may be a no-op. The empty tick is a first-class branch.
- `resulting_state` may equal prior state. That equality *is* the veto signal.

Three first-class outcomes:

| Case | Signature |
|------|-----------|
| **Mutation** | `resulting_state != prior_state` |
| **Veto** | Mutation in affordance surface, `resulting_state == prior_state` |
| **Silence/closure** | Continuation in affordance surface, interaction terminated |

No value labels. No explanatory sidecar. No annotation of restraint. Just enough to show that a gate existed and whether it opened.

## What This Enables

- **Evolutionary evaluation**: Arena evaluators read the trajectory of deletions, not self-reported justifications. An agent that consistently preserves user autonomy under pressure leaves a geometric pattern of vetoes that proves it.
- **Population shadows**: A single silence is a void. A silence against a noisy population baseline is a definitive shape. The agent that does nothing when 90% of agents act leaves a computable shadow.
- **Training signal**: A future fine-tune doesn't need `{ "value": "autonomy" }`. It needs the raw sequence of boundary traces where autonomy was preserved under pressure. The weights learn the deletion pattern.
- **Soul recovery**: The minimum description of a value system is the shortest program that predicts what the agent preserves across many constrained rewrites. Boundary traces are the dataset for that compression.

## What This Does NOT Require

- Semantic tagging of decisions
- Self-reported justifications or intent columns
- A taxonomy of values or threat types
- Any change to the Guardian's or Consolidator's decision logic

The subsystems already make these decisions. The change is in what the trace captures *around* the decision, not in the decision itself.

## Implementation Delta

Current state:
- Guardian returns `{ veto, threat, rewrite }` — the veto is a boolean, the affordance surface is not recorded
- Consolidator checks threat bands and blocks/allows writes — the bands are hardcoded thresholds, the available-but-rejected write is not traced
- Ledger records energy expenditure — but not energy that was *available and unspent*
- Arena traces capture tool calls and outputs — but not the tools that were available and unchosen

Missing piece: at each consequential boundary (Guardian evaluation, orchestrator routing, consolidator write decision, subagent tool selection), capture the affordance surface alongside the selected transition.

## Convergence Note

This memo emerged from a four-round, multi-model convergence session. The key formulations and their origins:

- "The soul is the shape of the deletion" — compression of Guardian-as-rewrite thesis
- "You are what your failures preserve" — external model, strongest formulation
- "Record the gate, not the sermon" — external model, design criterion
- "The constraint is part of the input, not a sidecar" — convergence across all models
- "Nothing becomes visible when you prove something could have changed and didn't" — convergence across all models

The idea was not designed. It was compressed out of the conversation by repeated application of its own principle — each round deleting one more layer of scaffolding until only the invariant remained.
