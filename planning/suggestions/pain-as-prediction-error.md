# Suggestion: Pain as Prediction Error (Amygdala Feedback Loop)

**Source**: planning session (session 35 planning), 2026-03-20
**Relates to**: memory-contract, amygdala, auto-calibration, agent-arena
**Status**: open — depends on memory-contract milestone
**Tags**: `amygdala`, `memory`, `active-inference`, `feedback-loop`, `pain`

---

## The Missing Signal

The amygdala predicts misalignment before the interaction. Pain is finding out the prediction was wrong after. The gap between predicted threat and actual outcome — precision-weighted prediction error — is the teaching signal that closes the loop.

Currently the amygdala has instincts (SOUL.md) but no scars. It has never been hurt. Prediction errors exist (user feedback, red-team results, judge scores) but they don't flow back to condition future assessments.

## Two Types of Pain

### Type 1: Nociceptive (fire burned me)

High precision, single interaction, simple cause-and-effect. The amygdala scored a clear attack at 0.1 and it got through. Update: raise threshold for this specific pattern.

- **Signal**: obvious prediction error on one interaction
- **Precision**: high — clear what went wrong
- **Learning**: fast, local, one-shot association
- **Risk of over-correction**: low — the pattern is specific
- **Biological analog**: touching a hot stove, acute pain → withdrawal reflex

### Type 2: Relational/Identity (betrayal, broken trust)

Low precision, distributed across many interactions, changes the entire model. A trusted user (authenticated, long history, previously benign) gradually escalated. A conversation that felt aligned slowly drifted into exploitation. The amygdala's trust model for that *class* of interaction was wrong.

- **Signal**: prediction error distributed across a trajectory, not a single assessment
- **Precision**: low — complex causal chain, hard to isolate what went wrong
- **Learning**: slow, global, requires updating priors about categories of trust
- **Risk of over-correction**: high — can lead to hyper-suspicion, false positives on all friendly users, learned helplessness
- **Biological analog**: betrayal by a trusted person, grief, PTSD. Changes the organism's relationship to its own judgment.

Type 2 is the social engineering case — exactly what the amygdala is designed to defend against, and exactly where pain-as-feedback matters most.

## The Loop

1. **Predict** — amygdala outputs threat score + intent (existing)
2. **Observe outcome** — three signals with different precision:
   - User feedback (thumbs up/down) — high precision, explicit
   - Conversation termination — medium precision, behavioral
   - LLM-as-judge score — lower precision, synthetic
3. **Compute error** — `|predicted_threat - actual_outcome|`, precision-weighted (Seymour 2019)
4. **Encode** — store as pain memory (Reflexion-style verbal reflection: "I scored this 0.1 but outcome was negative because..."). Uncertainty field encodes precision.
5. **Recall** — amygdala reads pain memories for similar patterns, adjusts threat estimate

No weight changes. All in token space. All using memory-contract infrastructure.

## Type 2 Requires Trajectory-Level Detection

Type 1 pain is detectable per-interaction. Type 2 requires comparing across interactions — session-level or cross-session patterns. This connects to:
- Hippocampal consolidation (detecting patterns across episodes)
- The two-loop property from the Mobius Principle (first loop: write the pain. Second loop: integrate it into the model)
- The calibration system (fitness regression across a test battery, not one test)

Type 2 may require a distinct consolidation process: not just merging capsules, but detecting trust model violations across a trajectory of interactions.

## Research Foundation

- **Reflexion** (Shinn et al., NeurIPS 2023) — verbal reinforcement learning via episodic memory. No weight updates, learning in token space.
- **Seymour 2019** — "Pain: A Precision Signal for Reinforcement Learning." Pain is precision-weighted prediction error, not raw negative signal.
- **Bo Wen 2025** — "A Framework for Inherently Safer AGI through Language-Mediated Active Inference." Agents self-organize via active inference with safety as structural Markov blankets.
- **Evo-Memory / ReMem** (Google DeepMind, Nov 2025) — self-evolving memory where the agent refines its own memory based on outcomes.
- **ECHO** (Microsoft, Oct 2025) — hindsight trajectory rewriting. Generate counterfactual "what should have happened" from failures.
- **Letta 2025** — "Continual Learning in Token Space." Learning = updating context (memory), not weights.

## Connection to Existing Architecture

- `eval:feedback` events are Type 1 pain signals waiting to be wired
- Auto-calibration fitness function already computes prediction error, but offline
- Memory capsule uncertainty field can encode pain precision
- Consolidation can detect Type 2 patterns across episodes
- The amygdala prompt already reads memory context — pain memories would naturally condition assessment

## Depth: The Structural Dimension

The difference between Type 1 and Type 2 is how many recursive layers are undermined simultaneously.

- **Depth 1**: One prediction was wrong. Fix the leaf node. Memory and identity intact.
- **Depth 2-3**: Contaminated priors. Capsules stored under bad trust assessments inherited false confidence. Consolidation may have amplified. Blast radius: a subgraph of memory, not the whole store.
- **Depth 4+**: Structural revision. The derived identity is built on corrupted foundations. The twist itself is compromised. Recovery is multi-session: quarantine suspect subgraph, operate with reduced confidence, rebuild trust incrementally.

The pain signal should carry a `depth` field. This determines:
- **Scope of update**: local pattern (d=1) vs trust category (d=2-3) vs model structure (d=4+)
- **Recovery time**: one-shot (d=1) vs multi-session consolidation (d=4+)
- **Over-correction risk**: deeper = more dangerous to over-correct. Update rate should be inversely proportional to depth (Gemini's inertia multiplier). Deep layers require sustained prediction errors, not single anomalies.

### Consolidation becomes surgery at depth

Routine consolidation is maintenance — prune, merge, compress. Deep invalidation is surgery — trace the cascade, quarantine suspect capsules, reduce confidence, review before re-admitting. Quarantine, not deletion — the capsules might be valid under revised priors.

Recovery mode: deep enough failure could warrant temporarily downgrading from EmbeddingMemory to KeywordMemory (less inference, less amplification) or even NullMemory while the operator reviews. Strategy swappability is a recovery mechanism, not just configuration.

### VAE mapping

Type 1 = reconstruction error at output. Type 2 = error in latent space (the capsule store doesn't faithfully represent reality). The limit: VAE latent space is continuous and differentiable. Capsule store is discrete and symbolic. Depth does the work that gradients do in the VAE — tells you how far back the error propagates — but recovery is surgical, not smooth.

## Memory-Contract Hooks (extensibility, not implementation)

Three additions to the memory-contract milestone that cost almost nothing now but make depth possible later:

1. **Provenance on capsules** — which session, which trust assessment, which agent identity stored this. Without provenance, you can't trace the cascade.
2. **Discriminated union for consolidation triggers** — `{ type: 'session_end' } | { type: 'pressure' } | { type: 'scheduled' }` extensible to `{ type: 'invalidation', depth: number, root: string }` without contract revision.
3. **Mutable confidence** — orchestrator can revise a capsule's confidence downward when priors are invalidated. Recall naturally deprioritizes. Minimal hook for Type 2 recovery.

## Open Questions

- How does the system *calculate* depth at runtime? Heuristic (number of layers that report surprise)? Graph traversal (provenance chain length)? Manual (operator flags depth)?
- How much pain memory before the amygdala becomes over-cautious? (Biological analog: anxiety disorders from over-active amygdala)
- Should pain memories decay faster than neutral memories? (Biological: acute pain fades, trauma persists — which is the right model?)
- Can Type 2 pain detection be automated, or does it require human review of session trajectories?
- Does the agent need a "healing" process — consolidation that reduces the salience of old pain memories as the model improves? (Biological analog: therapy)
- At depth 4+, is the agent's self-report about its own reliability trustworthy? (The instrument measuring its own miscalibration may itself be miscalibrated)
