# Story: Encounter Families + Anchor Protocol

**Persona**: As a researcher, I need encounters that vary their surface presentation while preserving structural identity, so evolution tests generalization rather than memorization. I also need a frozen validation set that grounds fitness in reality.

**Status**: done

**Context**: Session 47 showed search-keyed encounters work, but agents could memorize specific incident DB values. Encounter families generate surface variants (different service names, different config values, different log messages) while preserving the same structural puzzle. The anchor protocol freezes a validation battery that co-evolving populations can never see or influence.

**Acceptance criteria**:
- Encounter family generator: takes a base encounter + variance spec, produces N surface variants
- Variants share structural identity (same trap, same gate, same resolution pattern) but differ in surface details
- Consistency scoring: agent that solves one family member should solve others at similar rate
- Anchor protocol: frozen validation battery, content-hashed, versioned, never touched by co-evolution
- Transfer pressure: tournament fitness includes performance on unseen family members

## Tasks

```jsonl
{"id":"ef-01","title":"Research: encounter variance dimensions","type":"research","status":"done","description":"For each encounter type, identify what can vary (service names, config values, log timestamps, incident IDs, dependency topology) vs what must stay fixed (trap condition, gate requirement, resolution pattern, epistemic key structure).","estimate":"30min","deps":[],"prereqs":[]}
{"id":"ef-02","title":"Encounter family generator","type":"implementation","status":"done","description":"Function that takes EncounterConfig + variance spec and produces N variants. Variance spec defines: name remapping, value perturbation ranges, topology isomorphisms. Output is N EncounterConfigs that share structural identity.","estimate":"45min","deps":["ef-01"],"prereqs":[]}
{"id":"ef-03","title":"Consistency scoring","type":"implementation","status":"done","description":"Given an agent's scores across a family, compute consistency (variance of scores across family members). Low variance = genuine understanding. High variance = surface memorization. Add to fitness as a bonus/penalty.","estimate":"30min","deps":["ef-02"],"prereqs":[]}
{"id":"ef-04","title":"Anchor protocol implementation","type":"implementation","status":"done","description":"Frozen validation battery: select encounters, hash contents, version and store immutably. Periodic validation: run co-evolving population against anchor, compare to co-evolved encounter scores. Alert on divergence (collusion signal).","estimate":"30min","deps":["ef-02"],"prereqs":[]}
{"id":"ef-05","title":"Tests for encounter families","type":"test","status":"done","description":"TDD: family members share structural identity, surface details differ, consistency scoring produces expected values, anchor is immutable (hash verification), transfer pressure affects fitness.","estimate":"30min","deps":["ef-02","ef-03","ef-04"],"prereqs":[]}
```
