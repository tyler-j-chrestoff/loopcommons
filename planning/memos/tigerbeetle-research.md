# TigerBeetle as Thermodynamic Agent Substrate — Research Memo

**Date:** 2026-03-24
**Status:** Research complete, recommendation below

---

## 1. TigerBeetle Node.js Client

**Package:** `tigerbeetle-node` on npm
**Version:** 0.16.78 (published daily, 378 versions total — very active)
**License:** Apache-2.0
**Dependencies:** None (ships native binary via platform-specific optionalDependencies)

The Node.js client is production-ready. All language clients are maintained in the main TigerBeetle monorepo (the separate `tigerbeetle-node` GitHub repo is archived).

### API Surface

```javascript
const { Client } = require("tigerbeetle-node");

// Connect to cluster
const client = new Client({ addresses: ["localhost:3000"] });

// Create accounts (batch up to 8189)
const accountErrors = await client.createAccounts([{
  id: 1n,           // 128-bit, BigInt in JS
  ledger: 700,      // numeric ledger ID
  code: 10,         // account type code
  flags: 0,         // AccountFlags bitmask
  // user_data_128, user_data_64, user_data_32 — indexed metadata
}]);

// Create transfers (batch up to 8189)
const transferErrors = await client.createTransfers([{
  id: 1n,
  debit_account_id: 1n,
  credit_account_id: 2n,
  amount: 1000n,    // 128-bit unsigned
  ledger: 700,
  code: 10,
  flags: 0,
  // pending_id, timeout — for two-phase
  // user_data_128, user_data_64, user_data_32
}]);

// Lookup accounts
const accounts = await client.lookupAccounts([1n]);
// Returns: { debits_posted, credits_posted, debits_pending, credits_pending, ... }

// Query accounts (filterable)
const results = await client.queryAccounts({
  ledger: 700,
  code: 10,
  timestamp_min: 0n,
  timestamp_max: 0n,  // 0 = no bound
  limit: 100,
  flags: 0,  // reversed flag available
});

// Balance history (requires account created with history flag)
const balances = await client.getAccountBalances({ account_id: 1n, ... });
```

Errors are returned as arrays of `{ index, result }` — empty array means success. The client auto-batches concurrent operations for throughput.

---

## 2. Data Model Mapping

### TigerBeetle Primitives

| Primitive | Fields | Semantics |
|-----------|--------|-----------|
| **Account** | id, ledger, code, debits_posted, credits_posted, debits_pending, credits_pending, user_data_128/64/32, flags, timestamp | Running balance via debit/credit accumulators |
| **Transfer** | id, debit_account_id, credit_account_id, amount, ledger, code, pending_id, timeout, user_data_128/64/32, flags, timestamp | Atomic double-entry movement |
| **Ledger** | Numeric ID on accounts | Isolation boundary — transfers only within same ledger |

Key account flags: `debits_must_not_exceed_credits`, `credits_must_not_exceed_debits`, `linked`, `history`.
Key transfer flags: `pending`, `post_pending_transfer`, `void_pending_transfer`, `linked`.

### Proposed Mapping

| Agent Concept | TigerBeetle Primitive | Details |
|---------------|----------------------|---------|
| **Agent subsystem** (router, guardian, orchestrator, amygdala, reflector, etc.) | Account | One account per subsystem per agent. Balance = available energy. `credits_must_not_exceed_debits` enforces "can't spend what you don't have." |
| **Energy transfer** between subsystems | Transfer | Subsystem A pays subsystem B for work. Double-entry ensures conservation. |
| **Staking bid** (subsystem bids energy to handle a message) | Pending transfer | `flags.pending` + `timeout`. Energy reserved from bidder's account. |
| **Stake resolution** (outcome measured, reward or slash) | Post/void pending transfer | Good outcome: post with reduced amount (bidder keeps profit). Bad outcome: post full amount (energy moves to system pool). Timeout: auto-void returns stake. |
| **Intra-agent boundary** | Ledger N | All subsystems of agent A on ledger 1. |
| **Inter-agent boundary** | Ledger M | Cross-agent delegation uses linked transfers across ledgers. |
| **Organizational boundary** | Ledger O | Non-profit funds → agent API budget on a separate ledger. |
| **Energy budget** (fixed per cycle) | Transfer from "sun" account | A system account credits subsystems each cycle. Conservation = total debits always equal total credits. |
| **Metabolism** (resting cost) | Periodic transfer | Each subsystem auto-debits resting energy cost. Zero balance = dormant. |
| **Subsystem identity** (what kind of subsystem) | Account `code` field | code=1 router, code=2 guardian, etc. |
| **Correlation to request** | Transfer `user_data_128` | Store request ID / conversation turn in metadata. |

### What Maps Well

- **Conservation is native.** Double-entry means energy is never created or destroyed — the database enforces this, not application code.
- **Balance constraints are native.** `credits_must_not_exceed_debits` = "can't spend energy you don't have" — enforced at DB level.
- **Two-phase transfers = staking.** Pending → post/void maps directly to bid → reward/slash. Timeout handles abandoned bids.
- **Atomicity via `linked` flag.** Chain multiple transfers atomically — e.g., simultaneously debit bidder + credit worker + debit system pool.
- **Audit trail is native.** Immutable append-only log. Every energy flow is traceable. The non-profit board reads a financial report that IS the thermodynamic state.
- **Balance history.** With `history` flag, every balance change is recorded with its timestamp. Energy flow over time is queryable.
- **user_data fields.** Three indexed metadata fields (128/64/32 bit) per account and transfer — enough to correlate with request IDs, session IDs, agent IDs.

---

## 3. Two-Phase Transfer Lifecycle (Staking Protocol)

This is the critical mechanism. Here's how it maps:

### Phase 1: Bid

```
Subsystem stakes 50 energy to handle message:
  Transfer { flags: pending, timeout: 30,
             debit: subsystem_account, credit: escrow_account,
             amount: 50, user_data_128: request_id }
```

Effect: `subsystem.debits_pending += 50`, `escrow.credits_pending += 50`. The 50 energy is reserved but not moved yet.

### Phase 2a: Reward (good outcome)

```
Outcome measured, subsystem performed well:
  Transfer { flags: post_pending_transfer,
             pending_id: original_transfer_id,
             amount: 20 }  // Only 20 of 50 actually charged
```

Effect: 20 energy moves to escrow (cost of work). 30 returns to subsystem (profit). Subsystem net: -20. This is cheaper than the bid — the subsystem is rewarded for good performance.

### Phase 2b: Slash (bad outcome)

```
Outcome measured, subsystem failed:
  Transfer { flags: post_pending_transfer,
             pending_id: original_transfer_id,
             amount: 50 }  // Full stake forfeited
```

Effect: Full 50 energy moves to system pool. Subsystem loses entire stake.

### Phase 2c: Timeout (no resolution)

```
30 seconds pass with no post/void:
  Auto-void by TigerBeetle
```

Effect: Full 50 energy returns to subsystem. No cost, no reward.

### Key Properties

- **Single resolution:** A pending transfer resolves exactly once (post, void, or timeout). No double-spend.
- **Partial posting:** The posted amount can be less than the pending amount. This enables graduated reward/punishment.
- **Timeout is native:** TigerBeetle handles expiration automatically. No application-side cron needed.
- **Balance invariants hold through pending phase.** The pending amount is reserved — other transfers can't spend it. A subsystem with 50 energy and a 50-energy pending stake has 0 available, even before resolution.

### Limitation: Conditional Resolution

TigerBeetle doesn't have built-in "resolve based on external condition." The application must:
1. Create pending transfer
2. Measure outcome externally (LLM eval, user feedback, etc.)
3. Call post or void based on result

This is fine — the outcome measurement is inherently application logic. TigerBeetle handles the accounting atomically; the application handles the decision.

---

## 4. Constraints and Limitations

### Operational Overhead

| Concern | Reality |
|---------|---------|
| **Deployment** | Single static binary. `tigerbeetle format` + `tigerbeetle start`. Can run as sidecar process or Docker container. |
| **Data storage** | Single data file (e.g., `data.tigerbeetle`). Not a directory, not multiple files. |
| **Memory** | Requires dedicated memory proportional to account count. Not a concern at agent scale (hundreds of accounts, not millions). |
| **Railway compatibility** | Runs as a subprocess or sidecar. Needs a persistent volume (already have one at `/app/data`). Single binary, no dependencies. |

### Hard Limitations

1. **No SQL, no ad-hoc queries.** Only: create/lookup accounts, create/lookup transfers, query by filter, get balance history. No joins, aggregations, or complex queries. Analytics must happen in a separate system (DuckDB/pipeline).

2. **Fixed schema.** Two entity types: Account, Transfer. No custom fields beyond the three `user_data` slots. If you need richer metadata, it goes in a sidecar database.

3. **No authentication.** TigerBeetle trusts its network environment. Fine for a sidecar process on the same host. Not suitable for direct client access over the internet.

4. **No UPDATE/DELETE.** Corrections require reversing transfers. This is actually a feature for audit — but means you can't "fix" a bad entry, only compensate for it.

5. **Ledger isolation is strict.** Transfers only between accounts on the same ledger. Cross-ledger movement requires linked transfer pairs (debit on ledger A + credit on ledger B, atomically linked).

6. **Batch limit: 8189 per request.** Not a concern at agent scale.

7. **Single-threaded.** Throughput via batching, not parallelism. At agent scale (tens of transfers per second), this is irrelevant — TigerBeetle handles millions per second.

8. **128-bit IDs.** Must use BigInt in JavaScript. Minor ergonomic friction, but manageable.

9. **No balance history by default.** Must opt in per account with the `history` flag at creation time. Can't retroactively enable.

### What Doesn't Map Well

- **Temperature/entropy metrics.** TigerBeetle tracks balances, not distributions. Computing entropy (energy distribution across subsystems) or temperature (variance of recent bids) requires reading all account balances and computing in application code. TigerBeetle won't do this for you.

- **Complex routing logic.** "Which subsystem should bid?" is application logic. TigerBeetle only enforces the accounting after the decision is made.

- **Historical analytics.** "Show me energy flow over the last hour grouped by subsystem type" requires exporting to DuckDB/pipeline. TigerBeetle's query API is limited to filtering, not aggregation.

- **Naming and metadata.** Accounts have numeric IDs, ledger IDs, and codes — no string names. Mapping "amygdala" → account ID 7 requires a separate lookup table.

---

## 5. Alternatives

### Option A: SQLite with Double-Entry Pattern

**Pros:**
- Already familiar (DuckDB in stack, similar SQL dialect)
- Ad-hoc queries, aggregations, joins — all the analytics TigerBeetle can't do
- String names, rich metadata, flexible schema
- `better-sqlite3` is synchronous and fast for single-process use
- Libraries exist: `medici` (MongoDB), `ale` (Sequelize/SQLite)

**Cons:**
- Balance constraints enforced in application code (CHECK constraints help but aren't as robust)
- Two-phase transfers must be implemented manually (BEGIN/COMMIT with application logic)
- No native timeout on pending transfers
- Audit trail requires explicit append-only discipline (SQLite allows UPDATE/DELETE)
- Conservation invariant (total debits = total credits) must be enforced in application code

**Verdict:** Workable. More flexible. Less safe. The "double-entry invariant enforced by the database" guarantee is the main thing you lose.

### Option B: In-Memory Ledger with WAL

**Pros:**
- Simplest possible implementation
- Full control over data model
- No external process
- Can be written in a few hundred lines of TypeScript

**Cons:**
- Every invariant is application code
- WAL implementation is non-trivial if you want crash recovery
- Basically reinventing a subset of TigerBeetle, poorly

**Verdict:** Only if this is a prototype that will never see production.

### Option C: DuckDB (Already in Stack)

**Pros:**
- Already in the pipeline package
- SQL analytics are native
- Append-only tables achievable with convention

**Cons:**
- DuckDB native bindings break Next.js build (known issue in this project)
- DuckDB is OLAP-optimized, not OLTP — designed for batch analytics, not real-time transaction processing
- No native double-entry constraints
- No two-phase transfer primitives
- Would be used for the wrong workload

**Verdict:** Good for analytics on exported ledger data. Wrong tool for the transactional ledger itself.

### Option D: TigerBeetle for Transactions + DuckDB for Analytics

**Pros:**
- Each tool used for its strength
- TigerBeetle enforces conservation/constraints in real-time
- DuckDB/pipeline handles aggregation, entropy metrics, historical analysis
- Already have the pipeline infrastructure (Dagster consolidation)

**Cons:**
- Two systems to maintain
- Sync between TigerBeetle and DuckDB needed (periodic export)

**Verdict:** This is the natural architecture if TigerBeetle is adopted.

---

## 6. Recommendation

**Use TigerBeetle, but defer until the agent framework pivot is underway.**

### Why TigerBeetle

The data model fit is unusually good. The core thesis — energy conservation enforced at the database level, not application code — maps directly to TigerBeetle's design purpose. Specifically:

1. **Two-phase transfers are staking.** This isn't a metaphor; it's a direct mapping. Pending transfer = bid, post = reward, void = slash, timeout = abandoned bid. TigerBeetle's semantics match exactly.

2. **Conservation is free.** Double-entry bookkeeping means `sum(debits) = sum(credits)` is a database invariant. Energy can't be created or destroyed without violating the invariant. This is the thermodynamic property you want, and it's enforced automatically.

3. **Balance constraints are free.** `credits_must_not_exceed_debits` = "subsystem can't spend energy it doesn't have." Database-level enforcement, not application-level.

4. **Audit is free.** Immutable append-only log. The non-profit board's financial report and the agent's thermodynamic state diagram are the same artifact.

5. **Operational overhead is low.** Single binary, single data file, persistent volume you already have. Sidecar process on Railway.

### Why Defer

1. **The agent framework pivot is the priority.** Thermodynamic economics is a layer ON TOP of a working multi-channel agent. Build the agent first.

2. **The mana system works for arena.** Arena evolution already has an energy system. Thermodynamic ledger replaces it eventually, but it's not blocking anything.

3. **Analytics gap needs the pipeline.** TigerBeetle's query API is limited. Entropy/temperature metrics need DuckDB aggregation. The pipeline infrastructure exists but would need a TigerBeetle export asset.

4. **Naming/metadata needs a sidecar.** Mapping account IDs to subsystem names, storing configuration — this needs a small SQLite or JSON sidecar. Minor but worth noting.

### When to Build

When the agent framework has at least two subsystems that need to coordinate resource allocation. The natural trigger is when the router/guardian/orchestrator pattern is live and you want emergent priority rather than hardcoded routing weights. At that point, TigerBeetle adds real value — before that, it's infrastructure waiting for a use case.

### Architecture Sketch (for future reference)

```
                    ┌─────────────────┐
                    │  TigerBeetle    │
                    │  (sidecar)      │
                    │                 │
                    │  Ledger 1: Agent│
                    │  Ledger 2: Org  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
         ┌────┴────┐   ┌────┴────┐   ┌────┴────┐
         │ Router  │   │Guardian │   │Orchestr.│
         │ Acct 1  │   │ Acct 2  │   │ Acct 3  │
         └─────────┘   └─────────┘   └─────────┘
              │
              ▼
    ┌───────────────────┐
    │ Dagster Pipeline  │
    │ (periodic export) │
    │ TB → DuckDB       │
    └───────────────────┘
              │
              ▼
    ┌───────────────────┐
    │ DuckDB Analytics  │
    │ entropy, temp,    │
    │ flow analysis     │
    └───────────────────┘
```

---

## Sources

- [TigerBeetle documentation (single page)](https://docs.tigerbeetle.com/single-page/)
- [tigerbeetle-node on npm](https://www.npmjs.com/package/tigerbeetle-node)
- [Two-phase transfers](https://docs.tigerbeetle.com/coding/two-phase-transfers)
- [query_accounts API](https://docs.tigerbeetle.com/reference/requests/query_accounts/)
- [get_account_balances API](https://docs.tigerbeetle.com/reference/requests/get_account_balances/)
- [TigerBeetle community scrutiny discussion](https://biggo.com/news/202510011913_TigerBeetle_Database_Community_Scrutiny)
- [Medici — Node.js double-entry accounting](https://github.com/flash-oss/medici)
- [ALE — Node.js + Sequelize double-entry](https://github.com/CjS77/ale)
