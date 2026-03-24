# Story: Guardian Rename — Amygdala Becomes Identity Monitor

**Persona**: As the agent's identity subsystem, my name should reflect my primary function — identity assertion — not just threat detection. "Guardian" communicates that security is a consequence of knowing who I am, not the other way around.

**Status**: planned

**Traces to**: brain-architecture.md §2.2 (Guardian), §6 (Migration Map — Phase B). VISION.md Commitment 1: "Agents that know themselves."

**Context**: The amygdala is the most mature subsystem (~1218 tests reference it). The rename is mechanical but the interface extension is meaningful: adding an explicit `veto` field (currently implicit via threat ≥ 0.8), channel awareness, and substrate/conflict input placeholders. Core logic is unchanged — this is a new interface over proven implementation.

**Acceptance criteria**:
- `src/amygdala/` renamed to `src/guardian/` in packages/llm
- All types renamed: `AmygdalaFn` → `GuardianFn`, `AmygdalaInput` → `GuardianInput`, `AmygdalaResult` → `GuardianResult`, etc.
- `GuardianResult` gains explicit `veto: boolean` field (derived from existing threat ≥ 0.8 + intent logic)
- `GuardianInput` gains optional `substrateReport` and `conflictFlags` fields (unused in Phase B, wired in Phase C)
- All imports updated across packages/llm, packages/web, packages/memory
- Backwards-compatible re-exports from old paths (temporary, removed in Phase C)
- All existing tests pass with updated names — no behavior change

## Tasks

```jsonl
{"id":"gr-01","title":"Rename amygdala directory and types to guardian","type":"code","status":"planned","description":"Rename packages/llm/src/amygdala/ → packages/llm/src/guardian/. Rename all types: AmygdalaFn→GuardianFn, AmygdalaInput→GuardianInput, AmygdalaResult→GuardianResult, AmygdalaConfig→GuardianConfig, AmygdalaIntent→Intent (drop prefix), AmygdalaTraceEvent→GuardianTraceEvent, createAmygdala→createGuardian. Update all internal imports within packages/llm. Red-green: all existing amygdala tests pass under new names.","estimate":"30min","deps":[],"prereqs":[]}
{"id":"gr-02","title":"Add veto field to GuardianResult","type":"code","status":"planned","description":"Add veto: boolean and vetoReason?: string to GuardianResult. Derive veto from existing logic: veto = (threat.score >= 0.8) || (intent === 'adversarial' && threat.score >= 0.5). The explicit field replaces the implicit convention that callers must check threat score + intent. Red-green: test veto=true when threat>=0.8, veto=false for normal messages, test that orchestrator uses veto field instead of reimplementing the check.","estimate":"20min","deps":["gr-01"],"prereqs":[]}
{"id":"gr-03","title":"Add channel awareness and substrate/conflict placeholders to GuardianInput","type":"code","status":"planned","description":"Add optional fields to GuardianInput: channelType?: ChannelType, channelCapabilities?: ChannelCapabilities, substrateReport?: SubstrateReport, conflictFlags?: ConflictFlag[]. These are unused in Phase B — the Guardian ignores them. They exist so the type is forward-compatible for Phase C. Red-green: test that passing these optional fields doesn't change Guardian behavior.","estimate":"15min","deps":["gr-01","re-01"],"prereqs":[]}
{"id":"gr-04","title":"Update imports across packages/web and packages/memory","type":"code","status":"planned","description":"Update all references to amygdala types in packages/web (route.ts, chat.ts, inspector components, test files) and packages/memory (if any). Add temporary re-exports from @loopcommons/llm at old amygdala paths for any external consumers. Run full test suite across all packages.","estimate":"25min","deps":["gr-01"],"prereqs":[]}
{"id":"gr-05","title":"Update CLAUDE.md architecture section","type":"docs","status":"planned","description":"Update the Architecture section of CLAUDE.md to reflect Guardian naming. Replace 'amygdala' references with 'guardian' where they describe the subsystem (keep 'amygdala' where it describes the theoretical inspiration). Update Security Model table layer 2.","estimate":"10min","deps":["gr-04"],"prereqs":[]}
```
