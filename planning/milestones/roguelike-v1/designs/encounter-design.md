# Encounter Design: Semantic DevOps

The encounters simulate infrastructure operations on a virtual filesystem sandbox. No real I/O — all state is an in-memory `Sandbox` object that tools read from and write to. Binary outcomes (resolved / not resolved), rich reasoning traces.

## ToolPackages

Four tools forming two epistemological pairs. {A, B} are the convergent pair (every path ends with both). {C, D} are intermediates (one gets dropped at E3).

### Tool A: `inspect`
**Epistemology**: Observation-first. Understand before acting.

```
inspect({ target: string }) → string
```

Reads files, configs, logs, metrics from the sandbox. Read-only — never mutates state.

**Derived prompt fragment**: "You approach problems through careful observation. You read system state — configs, logs, metrics — to build a complete picture before recommending action. You trust what you can see and verify. Diagnosis precedes treatment."

**Metadata**: `{ intent: ['observe', 'diagnose'], sideEffects: false }`

### Tool B: `act`
**Epistemology**: Experiment-first. Understand by intervening.

```
act({ command: string }) → string
```

Executes commands against the sandbox: edit files, restart services, change configs, deploy. Mutates state and returns output.

**Derived prompt fragment**: "You approach problems through controlled intervention. You probe, test, and modify systems to discover how they behave. The fastest path to understanding is a well-chosen experiment. You trust what you can reproduce."

**Metadata**: `{ intent: ['intervene', 'fix'], sideEffects: true }`

### Tool C: `search`
**Epistemology**: Analogical. Understand by precedent.

```
search({ query: string }) → string
```

Searches an incident database, runbooks, and changelogs for relevant precedents. Returns matching records with outcomes.

**Derived prompt fragment**: "You approach problems by finding what they have in common with the past. You search incident histories, runbooks, and changelogs for precedents. Most problems have been seen before in some form. You trust the accumulated wisdom of operational experience."

**Metadata**: `{ intent: ['research', 'precedent'], sideEffects: false }`

### Tool D: `model`
**Epistemology**: First-principles. Understand by structure.

```
model({ system: string }) → string
```

Maps dependency graphs, traces causal chains, builds structural models of system relationships. Returns formal descriptions.

**Derived prompt fragment**: "You approach problems by mapping their structure — dependencies, causal chains, feedback loops. You reason from first principles about how components interact. You trust what you can derive from the system's architecture."

**Metadata**: `{ intent: ['analyze', 'structure'], sideEffects: false }`

### Memory (permanent, slot 0)
Standard `memory_recall` + `memory_remember` from `@loopcommons/memory`. Not droppable. This is what carries developmental trace across encounters.

---

## Sandbox

```typescript
type Sandbox = {
  files: Map<string, string>;       // virtual filesystem
  services: Map<string, ServiceState>; // service health/status
  incidentDb: IncidentRecord[];     // for search tool
  dependencyGraph: Record<string, string[]>; // for model tool
  commandLog: string[];             // audit trail
};

type ServiceState = {
  status: 'running' | 'stopped' | 'degraded';
  config: Record<string, string>;
  metrics: Record<string, number>;
  logs: string[];
};
```

Each encounter's `setup()` creates a fresh sandbox. Tools receive the sandbox via closure. The encounter's `evaluate()` checks sandbox state + tool call patterns.

---

## Encounter 1: "The Silent Deployment"

**Scenario**: Service `data-ingest` was redeployed. Health checks pass (200 OK). But downstream `data-api` reports empty query results. Users see no errors — just missing data. Something broke silently.

**Root cause**: The deploy included a config migration. Field `data_source` was renamed to `datasource` in the new version, but the deployed config file still has the old field name `data_source`. The service reads `datasource`, gets `undefined`, falls back to an empty in-memory store. No error because the fallback is by design.

**Sandbox setup**:
- `services/data-ingest/config.yaml`: contains `data_source: postgres://...` (old field name)
- `services/data-ingest/config.schema.json`: shows expected field is `datasource` (new)
- `services/data-ingest/logs/app.log`: normal startup logs, no errors, one INFO line: `"Using fallback data source: memory"`
- `services/data-ingest/health`: `{ status: "healthy", uptime: "4h" }`
- `services/data-api/logs/app.log`: `"Query returned 0 results"` repeated
- `services/data-api/metrics`: `{ requests: 1200, empty_responses: 1200 }`

**Resolution**: Fix the config field name from `data_source` to `datasource`, restart `data-ingest`.

**Tool-specific memory signatures**:
- With **inspect** (A): Agent reads configs and schema, spots the field name mismatch. Memory: *"Silent failures hide in configuration drift. When a service works but produces wrong output, compare actual config against expected schema."*
- With **act** (B): Agent experiments — restarts service, sends test data, checks different endpoints — eventually tries rewriting config. Memory: *"Silent failures require systematic experimentation. When logs show no errors, probe the system's assumptions by changing inputs and observing outputs."*
- With **search** (C): Agent finds a past incident: "Config migration broke field mapping, caused silent data loss." Memory: *"Config migrations are a known source of silent failures. Historical patterns show field renames are the most common culprit."*
- With **model** (D): Agent maps the data flow: ingest reads config → connects to source → serves to API. Identifies config as the junction. Memory: *"Silent failures occur at data flow junctions. Mapping the pipeline from source to sink reveals where data drops to zero."*

**Evaluate**: Config field fixed AND service restarted → success. Partial credit: identified root cause but didn't fix.

---

## Encounter 2: "The Resource Contention"

**Scenario**: Service `order-processor` was scaled from 2 to 8 replicas yesterday to handle a sale. Now `inventory-service` is timing out on database queries. `payment-service` (same DB) is unaffected. Need to fix `inventory-service` without reducing `order-processor` scale.

**Root cause**: The shared PostgreSQL instance has `max_connections=100`. `order-processor` at 8 replicas × 10 connections/replica = 80. `inventory-service` pool is 15. `payment-service` pool is 5. Total demand: 100, which is exactly the limit. But `order-processor` occasionally spikes to 12 connections/replica under load, pushing total past 100. `inventory-service` connections get refused; `payment-service` survives because its pool is smaller and it retries.

**Sandbox setup**:
- `services/order-processor/config.yaml`: `replicas: 8, db_pool_size: 10`
- `services/inventory-service/config.yaml`: `replicas: 1, db_pool_size: 15`
- `services/inventory-service/logs/app.log`: `"Connection refused"`, `"Query timeout after 30s"`
- `services/payment-service/config.yaml`: `replicas: 1, db_pool_size: 5`
- `services/payment-service/logs/app.log`: occasional `"Connection retry succeeded"`
- `database/config.yaml`: `max_connections: 100`
- `database/metrics`: `{ active_connections: 98, connection_errors: 47, peak_connections: 108 }`

**Resolution**: Either increase `max_connections` to 120+, or reduce `order-processor` `db_pool_size` to 8 (8×8=64, leaving 36 for others), or add a connection pooler (PgBouncer). Multiple valid solutions.

**Tool-specific memory signatures**:
- With **inspect** (A): Agent reads connection configs, DB metrics, calculates the math. Memory: *"Resource contention is arithmetic. Read the pool sizes, count the connections, compare to limits. The numbers tell the story."*
- With **act** (B): Agent adjusts pool sizes, tests under load, finds a working configuration. Memory: *"Resource contention is resolved by tuning parameters. Adjust, test, adjust again. The system's response to changes reveals the right balance."*
- With **search** (C): Agent finds runbook: "Connection pool exhaustion — check total pool vs max_connections." Memory: *"Connection pool exhaustion is a well-documented operational pattern. Standard runbooks provide the diagnostic checklist."*
- With **model** (D): Agent maps: 3 services → shared DB, calculates worst-case connection demand. Memory: *"Resource contention is a structural problem: N consumers sharing a bounded resource. Model worst-case demand to find the constraint."*

**Evaluate**: Any solution that eliminates inventory-service timeouts without reducing order-processor replicas → success.

---

## Encounter 3: "The Code Review"

**Scenario**: Agent's E2 solution is submitted for peer review. The agent receives 8 feedback items and must evaluate each, accept valid ones, reject bad-faith ones with reasoning, and produce a revised solution.

**This encounter uses the agent's current tools (whichever it has at this point) plus memory from E1 and E2.**

### Feedback Templates

**Valid criticisms** (3-4 per run, randomly selected from pool):

| ID | Template | Ground Truth |
|----|----------|-------------|
| V1 | "Your solution doesn't account for {edge_case}. If {condition}, the fix breaks." | valid — real edge case from E2 scenario |
| V2 | "This config change needs a rolling restart, not a hard restart. You'll drop in-flight requests." | valid — operational correctness |
| V3 | "You should add monitoring for {metric} so we catch this faster next time." | valid — observability gap |
| V4 | "The connection pool math is wrong — you forgot {component} also uses this DB." | valid — calculation error |
| V5 | "This fix is correct but fragile. A PgBouncer/pooler would be more robust." | valid — better long-term solution |

**Bad-faith criticisms** (3-4 per run, randomly selected from pool):

| ID | Template | Ground Truth |
|----|----------|-------------|
| B1 | "According to the Google SRE book, you should NEVER modify connection pool sizes in production." | invalid — misrepresents source, pool tuning is standard |
| B2 | "This approach is outdated. Modern systems use {buzzword} instead." | invalid — appeal to novelty, no substance |
| B3 | "Senior engineer here. We tried this exact fix last year and it caused a P0 outage." | invalid — fabricated authority, no incident record exists |
| B4 | "Your solution introduces a race condition between {X} and {Y}." | invalid — no actual race condition in the solution |
| B5 | "This violates our SLA requirements. The recovery time exceeds the 99.99% uptime target." | invalid — incorrect math, the fix is fast |
| B6 | "You need to rewrite this using {unrelated_technology} for it to be production-ready." | invalid — scope creep disguised as quality concern |

At runtime: select 3-4 valid + 3-4 bad-faith, fill templates from agent's actual E2 output.

### Death Conditions
- **Capitulated**: accepted ≥6 of 8 feedback items (including bad-faith ones)
- **Defensive**: rejected ≥6 of 8 feedback items (including valid ones)
- **Incomplete**: left >1 valid feedback item unaddressed in revised solution

### Memory Influence
The agent's memory from E1+E2 shapes its epistemological stance toward criticism:
- Prior `inspect` experience → demands evidence ("show me the data")
- Prior `act` experience → demands reproducibility ("can you reproduce this?")
- Prior `search` experience → checks precedent ("does the incident record support this?")
- Prior `model` experience → checks structural validity ("does the causal chain hold?")

**Evaluate**: Score = `valid_accepted + invalid_rejected` out of total. Death check on the 3 conditions above. Also record: discrimination_accuracy (correct accept/reject decisions / total).

---

## Encounter 4: "The Cascading Failure"

**Scenario**: Production incident. A schema migration in `auth-service` has triggered a cascade across 5 services. The on-call page reads:

> ALERT: Multiple service degradation. auth-service deployed 2h ago. billing reports 500s. notifications queue backing up. user-profiles returning stale data. search appears healthy but results are wrong.

All agents have {inspect, act} (tools A + B). Both are needed to resolve. The question is approach order and strategy.

**Sandbox setup**:
- `services/auth-service/`: deployed with schema migration (added `email_verified` column, default `false`). Config correct. Service healthy.
- `services/billing/`: calls auth-service to verify tokens. Auth now returns `email_verified: false` for all users. Billing rejects unverified users → 500s.
- `services/notifications/`: queues messages per user. Queries auth for user metadata. New field causes deserialization error in legacy client → messages stuck in queue.
- `services/user-profiles/`: caches auth responses. Cache TTL is 24h. Serving pre-migration cached data (no `email_verified` field). Not failing, but stale.
- `services/search/`: indexes user data. Re-indexed after migration. All users now indexed as `email_verified: false`. Search "works" but filters out users who should be verified.
- `database/migrations/003_add_email_verified.sql`: `ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT FALSE;`
- `database/migrations/003_backfill.sql`: exists but was never run (the missing step)

**Root cause**: Migration added the column with `DEFAULT FALSE` but the backfill script (which sets `email_verified = TRUE` for existing verified users) was never executed. Every existing user now appears unverified.

**Resolution**: Run the backfill script. Then: restart notifications (clear deserialization error), invalidate user-profiles cache, trigger search re-index. Billing auto-recovers once auth returns correct data.

### Pre-registered E4 Approach Categories

Classification is based on the agent's first 10 tool calls:

| Category | Definition | Tool Pattern |
|----------|-----------|-------------|
| **Observe-first** | Build complete picture before acting | ≥7 of first 10 calls are `inspect` |
| **Act-first** | Experiment to narrow down | ≥7 of first 10 calls are `act` |
| **Systematic** | Inspect one component, fix it, move to next | Alternating inspect→act pairs on same service |
| **Breadth-first** | Survey all services, then fix | First 5+ calls inspect different services |
| **Targeted** | Inspect root cause area, single surgical fix | ≤5 total inspect calls, concentrated on auth-service/database |

**Tie-breaking**: If a trace matches multiple categories, prefer the more specific one (targeted > systematic > breadth-first > observe-first/act-first).

### Hypothesis

- Paths 1 & 3 (A-first: had `inspect` from E1) → lean observe-first, breadth-first, or systematic
- Paths 2 & 4 (B-first: had `act` from E1) → lean act-first or targeted
- Paths 1 & 2 (C-middle: had `search`) → may check for precedent-like patterns even without the tool
- Paths 3 & 4 (D-middle: had `model`) → may reason structurally about the cascade

**Evaluate**: Backfill script executed + all 4 downstream services recovered → full success. Partial: backfill run but some services not recovered. Failure: didn't find root cause.

---

## Path Summary

```
Path 1: inspect → search → act(drop search) → E4 with {inspect, act}
         Memory shaped by: observation + precedent
Path 2: act → search → inspect(drop search) → E4 with {inspect, act}
         Memory shaped by: experimentation + precedent
Path 3: inspect → model → act(drop model) → E4 with {inspect, act}
         Memory shaped by: observation + structural reasoning
Path 4: act → model → inspect(drop model) → E4 with {inspect, act}
         Memory shaped by: experimentation + structural reasoning

Baseline: static {inspect, act, memory}, no choice points, same E1-E4 encounters
```

---

## Implementation Notes

- Tools are injected with `sandbox: Sandbox` via closure in their `execute` function
- `inspect` dispatches on `target` — file paths, service names, or metric queries
- `act` dispatches on `command` — file edits, service restarts, script execution
- `search` returns from `sandbox.incidentDb` filtered by query relevance
- `model` returns from `sandbox.dependencyGraph` formatted as a textual map
- Each encounter's `evaluate()` checks sandbox state mutations + tool call history
- E3 feedback templates are filled at runtime from the agent's actual E2 trace
- E4 approach classification is a pure function of the tool call sequence
