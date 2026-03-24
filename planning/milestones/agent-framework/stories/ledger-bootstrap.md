# Story: Ledger Bootstrap — Energy Accounting from Day One

**Persona**: As a community member asking "why did you tell me that?", I need every agent decision to have an auditable energy cost, so the answer is a receipt — not a black box.

**Status**: planned

**Traces to**: brain-architecture.md §3 (Thermodynamic Ledger), §6 (Migration Map — Phase A). VISION.md Commitment 2: "Auditable by default."

**Context**: The design doc requires the Ledger interface and receipt format to ship in Phase A alongside the Router, even if the initial implementation is a simple in-memory counter. The trace system serves developers; the receipt serves the community. This story delivers the receipt. TigerBeetle integration is deferred to Phase E — this is the abstract interface + SimpleLedger.

**Acceptance criteria**:
- `Ledger` interface defined per §3 (stake, resolve, balance, fund)
- `SimpleLedger` in-memory implementation (Map-backed, no persistence, conservation in application code)
- Receipt format defined — human-readable accountability artifact
- Router emits energy cost for normalize + dispatch
- Guardian (amygdala) emits energy cost for threat assessment
- Orchestrator emits energy cost for routing
- Receipts included in ChannelResponse or trace
- All existing tests pass — ledger is additive, not breaking

## Tasks

```jsonl
{"id":"lb-01","title":"Define Ledger interface and receipt types","type":"code","status":"planned","description":"Create packages/llm/src/ledger/types.ts with Ledger, StakeBid, StakeReceipt, StakeOutcome, TransferResult, AccountBalance per design doc §3. Add Receipt type: human-readable format with subsystemId, purpose, energySpent, outcome, timestamp. Red-green: type tests that verify interfaces compile.","estimate":"15min","deps":[],"prereqs":[]}
{"id":"lb-02","title":"Build SimpleLedger — in-memory implementation","type":"code","status":"planned","description":"Create packages/llm/src/ledger/simple.ts implementing Ledger interface. Map<subsystemId, balance> backing store. stake() checks balance, decrements available, increments pending, returns receipt. resolve() applies outcome formula (quality * rewardRate), adjusts balances. fund() adds energy. balance() returns current state. Conservation: assert sum of all accounts is constant after each operation. Red-green: test stake → resolve cycle, test insufficient balance rejection, test conservation invariant.","estimate":"30min","deps":["lb-01"],"prereqs":[]}
{"id":"lb-03","title":"Wire Ledger into Router pipeline","type":"code","status":"planned","description":"Add optional Ledger to RouterConfig. When present, Router stakes energy before normalize + dispatch, resolves after pipeline completes. Guardian (amygdala) stakes before LLM call, resolves with quality based on threat assessment confidence. Orchestrator stakes before routing, resolves with quality=1.0 (deterministic). Collect receipts and attach to ChannelResponse trace. Red-green: test that Router with SimpleLedger produces receipts, test that Router without Ledger still works (backwards compatible).","estimate":"35min","deps":["lb-02","re-04"],"prereqs":[]}
{"id":"lb-04","title":"Define receipt rendering — human-readable format","type":"code","status":"planned","description":"Create packages/llm/src/ledger/receipt.ts with renderReceipt(receipts: StakeReceipt[]): string. Output: plain-text summary showing which subsystem spent what energy on what purpose, total cost, timestamp. This is the artifact a community member or admin can read. Red-green: test rendering produces readable output for a typical 3-subsystem interaction.","estimate":"15min","deps":["lb-01"],"prereqs":[]}
{"id":"lb-05","title":"Export Ledger from @loopcommons/llm","type":"code","status":"planned","description":"Add ledger exports to packages/llm/src/index.ts. Export Ledger interface, SimpleLedger, receipt renderer, all types. Sub-path @loopcommons/llm/ledger if needed. Verify no circular deps.","estimate":"10min","deps":["lb-02","lb-04"],"prereqs":[]}
```
