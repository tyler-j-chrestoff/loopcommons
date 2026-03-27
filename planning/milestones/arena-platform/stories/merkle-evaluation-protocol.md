# Story: Merkle-Committed Evaluation Protocol

**Persona**: As a researcher, I need every soul mutation's fitness evaluation to be cryptographically committed to a Merkle chain, so the evolutionary lineage is fully auditable, retroactive analysis is possible, and no unattested souls can enter the population.

**Status**: planned

**Context**: The Cryptographically Grounded Epistemics convergence (Claude + Gemini, 2026-03-26) established that the Merkle chain is forensic, not executive — it enables diagnosis, not rollback. Every soul state must carry its proof of fitness. The evaluation topology is a DAG (soul × encounter × evaluator), not a linear chain, because three populations co-evolve simultaneously. Two-tier evaluation (sampled sieve + full checkpoint) balances grounding rigor against compute cost.

**Prerequisites**: S57 (evaluator co-evolution) should be in progress or complete. Anchor protocol (S55, shipped) and community fitness (S56, shipped) are required foundations.

**Acceptance criteria**:
- Every soul mutation produces a Merkle-committed battery evaluation node
- Sieve evaluations commit RNG seed, selection algorithm, and encounter composition alongside results
- Full-battery checkpoints trigger on survival threshold, production candidacy, or gardener override
- Cross-evaluator sampling: every sieve includes contemporaneous + ancestral evaluator scoring
- Performance-gated decay for recent failures pool (exit on demonstrated competence, not time)
- Retroactive analysis: given any ancestor soul and any later-promoted anchor, determine counterfactual outcome
- Three-way failure decomposition: soul degradation vs evaluator degradation vs encounter degradation

## Tasks

```jsonl
{"id":"me-01","title":"Research: Merkle DAG evaluation topology","type":"research","status":"complete","description":"Claude + Gemini convergence (2026-03-26/27). Key findings: (1) Linear soul chain insufficient — co-evolution produces a DAG with three-way hash (soul, encounter, evaluator). (2) Two-tier protocol: stratified sieve (~30% sample per generation) + full checkpoint at survival/promotion thresholds. (3) Cross-evaluator sampling breaks collusion — score against contemporaneous + ancestral evaluator. (4) Performance-gated decay for recent failures (exit on 3 consecutive generations >0.9, instant re-entry on regression). (5) Merkle node structure: {soul_hash, battery_type, anchor_set_hash, sample:{seed, algorithm, composition}, results:[{encounter_hash, response_hash, score, evaluator_hash}], aggregate, timestamp}.","estimate":"0min","deps":[],"prereqs":[]}
{"id":"me-02","title":"Merkle node schema + hashing","type":"implementation","status":"planned","description":"Define MerkleEvaluationNode type matching converged structure. Implement content-addressable hashing: SHA-256 of canonical JSON. Each node links to parent soul hash and anchor_set_hash. Extend existing content-addressed identity (src/identity/) pattern.","estimate":"45min","deps":["me-01"],"prereqs":[]}
{"id":"me-03","title":"Stratified sieve sampler","type":"implementation","status":"planned","description":"Implement sieve selection: 100% newly promoted anchors, 30% high-variance (by encounter family), 20% recent failures (performance-gated pool), 50% random uniform (seeded PRNG). Commit seed + algorithm to evaluation node. Total sample size configurable (default ~30% of anchor set).","estimate":"45min","deps":["me-01"],"prereqs":[]}
{"id":"me-04","title":"Performance-gated failure pool","type":"implementation","status":"planned","description":"Track per-anchor failure history. Anchor enters pool on any sub-threshold score. Exits when 3 consecutive sampled evaluations across survivors score >0.9. Instant re-entry on regression. Ratchet mechanism — no time-based decay.","estimate":"30min","deps":["me-03"],"prereqs":[]}
{"id":"me-05","title":"Cross-evaluator sampling","type":"implementation","status":"planned","description":"Every sieve evaluation scores each soul against both the contemporaneous evaluator and a frozen ancestral evaluator (generation 0 or hand-authored baseline). Divergence between scores is logged as evaluator drift signal. Both scores committed to Merkle node.","estimate":"30min","deps":["me-02"],"prereqs":[]}
{"id":"me-06","title":"Checkpoint trigger + full battery","type":"implementation","status":"planned","description":"Full anchor battery triggered when: (1) soul survives N consecutive sieve generations (default N=5), (2) soul is candidate for production deployment, (3) gardener manual override. Checkpoint node committed with battery_type='checkpoint'. Production bridge requires checkpoint.","estimate":"30min","deps":["me-03"],"prereqs":[]}
{"id":"me-07","title":"Failure decomposition analysis","type":"implementation","status":"planned","description":"Given a Merkle DAG of evaluation nodes, decompose any failure into: soul degradation (all evaluators agree), evaluator degradation (contemporaneous passes, ancestral fails), or encounter degradation (all souls across lineage fail). Query interface for retroactive counterfactual analysis.","estimate":"45min","deps":["me-02","me-05"],"prereqs":[]}
{"id":"me-08","title":"Tests for evaluation protocol","type":"test","status":"planned","description":"TDD: Merkle nodes are content-addressed and tamper-evident, sieve composition matches configured ratios, performance-gated pool ratchets correctly, cross-evaluator divergence is detected, checkpoint triggers fire at correct thresholds, failure decomposition correctly classifies known scenarios.","estimate":"45min","deps":["me-02","me-03","me-04","me-05","me-06","me-07"],"prereqs":[]}
{"id":"me-09","title":"Integration with tournament runner","type":"implementation","status":"planned","description":"Wire Merkle evaluation protocol into tournament runner (ec-04). Every generation produces evaluation nodes committed to the DAG. Nodes persisted to disk alongside tournament JSONL. Observable in arena observatory.","estimate":"30min","deps":["me-08"],"prereqs":[]}
```
