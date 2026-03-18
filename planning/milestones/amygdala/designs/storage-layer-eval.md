# Storage Layer Evaluation for Trace Event Persistence

**Task**: amyg-17
**Date**: 2026-03-17
**Status**: Recommendation ready

## Context

The amygdala pipeline emits trace events (rewrites, classifications, threat scores, routing decisions) that must be persisted as the immutable source of truth for the data pipeline. These raw events flow through Dagster-orchestrated dbt models into labeled training data for open-source ML.

**Requirements recap**:
- Append-only, immutable event store
- Queryable by dbt (needs an adapter)
- Runs fully local, no cloud dependency for dev
- Low volume: ~100-1000 sessions/day initially
- Analytical/aggregation query patterns (dbt transformations, not OLTP)
- Must integrate with Dagster I/O managers

## Comparison Table

| Criterion | DuckDB | SQLite | Raw Parquet + DuckDB | Hybrid: JSONL write / DuckDB read |
|---|---|---|---|---|
| **dbt adapter** | `dbt-duckdb` v1.10.1 (Feb 2026). Owned by DuckDB org. Trusted adapter. Supports incremental, snapshots, external materialization to Parquet. | `dbt-sqlite` v1.10.0. Community adapter. Simplified materializations (drop+recreate, no CASCADE). No incremental merge. | Via `dbt-duckdb` external sources — DuckDB reads Parquet via `read_parquet()` glob. Full dbt-duckdb feature set applies. | Via `dbt-duckdb` — web server writes JSONL, Dagster consolidates to Parquet, DuckDB reads both. |
| **Dagster I/O manager** | First-class: `dagster-duckdb`, `dagster-duckdb-pandas`, `dagster-duckdb-polars`. Official integration with docs and examples. | **None.** No official `dagster-sqlite` I/O manager. Requires custom implementation. | Dagster has Parquet support via `dagster-polars` (PolarsParquetIOManager). Works but requires manual wiring. | JSONL: custom asset. Parquet/DuckDB: official I/O managers. Moderate wiring. |
| **Append performance** | Fast within a single process (Appender API, buffered). **Single-writer limitation across processes** — web server and Dagster cannot write simultaneously to the same `.duckdb` file. | WAL mode: ~70-100k writes/sec. Multiple readers + single writer. Better than DuckDB for multi-process append because SQLite's WAL is designed for this. Still single-writer, but queuing is handled gracefully. | File writes are lock-free — each event batch is a new file. No contention at all. Best append story. | JSONL append is a simple file-append, no locking needed (one file per session or time-bucketed). Best write story. |
| **Analytical query perf** | Columnar storage, vectorized execution. 10-100x faster than SQLite for aggregations, joins, window functions on >10k rows. Purpose-built for OLAP. | Row-oriented. Acceptable at low volumes but fundamentally wrong architecture for analytical workloads. Will degrade as data grows. | Parquet is columnar with predicate pushdown. DuckDB reads Parquet nearly as fast as its native format. Excellent. | JSONL is slow to scan. But once consolidated to Parquet by Dagster, same as "Raw Parquet + DuckDB". |
| **Concurrent access** | Single-writer, multiple-reader within one process. **Cross-process concurrent writes are not supported and will not be.** Web server writes + dbt reads = architectural conflict unless serialized. | WAL mode: concurrent reads do not block writes. One writer at a time, but readers proceed unblocked. Mature, battle-tested concurrency. | No database lock at all. Files are immutable once written. DuckDB opens them read-only. Perfect separation of concerns. | JSONL write has no lock. DuckDB reads consolidated Parquet. Zero contention. |
| **Operational complexity** | Single file. `EXPORT DATABASE` for backups. Corruption risk documented (disk-space exhaustion). No multi-process coordination story. | Single file. WAL mode is well-understood. Decades of production hardening. Backup = copy the file (with proper locking). | Multiple files to manage. Need compaction strategy (many small files degrade read perf). Backup = copy directory. | JSONL files accumulate; Dagster consolidation job required. But operational model is clear: append raw, compact to Parquet, query via DuckDB. |
| **Ecosystem/community** | Rapidly growing. DuckDB GitHub: 28k+ stars. dbt-duckdb maintained by DuckDB Labs. Active development (DuckLake, v1.4.x). | Mature, ubiquitous. But dbt-sqlite is community-maintained with known limitations. Dagster has no SQLite I/O manager. Ecosystem fit is poor for this use case. | DuckDB's Parquet support is first-class. Well-documented glob patterns, schema inference, predicate pushdown. | Combines proven patterns: JSONL for event logging (universal), Parquet for analytics (industry standard), DuckDB for queries (best-in-class embedded OLAP). |

## Detailed Analysis

### DuckDB (direct writes)

**Strengths**: Best analytical query engine for embedded use. First-class dbt adapter with incremental models, snapshots, and external materialization to Parquet. First-class Dagster I/O manager. Single-file simplicity.

**Fatal flaw for this project**: The web server (Next.js API route) needs to append trace events during request handling. dbt/Dagster needs to read (and potentially write intermediate tables) during pipeline runs. DuckDB does not support concurrent writes from multiple processes — and this limitation is [by design and permanent](https://duckdb.org/docs/stable/connect/concurrency). You would need to serialize all access through a single process, which means either:
1. A dedicated write-service (microservice overhead for a personal site — violates KISS)
2. Queue writes to a buffer and batch-insert (adds complexity and latency)
3. Only write during pipeline runs, not during request handling (loses real-time persistence)

None of these are acceptable for a v1 personal research platform.

### SQLite (direct writes)

**Strengths**: WAL mode handles concurrent readers + single writer gracefully. Decades of battle-testing. Simple to operate.

**Weaknesses**: Row-oriented storage is fundamentally wrong for analytical dbt models (aggregations, window functions, joins across thousands of events). The dbt-sqlite adapter is community-maintained with simplified materializations (no incremental merge, no CASCADE). Dagster has no SQLite I/O manager — you'd need to write custom asset code. The ecosystem fit is poor: you'd be fighting the tools instead of using them.

**Verdict**: Solves the concurrency problem but creates performance and ecosystem problems.

### Raw Parquet files (with DuckDB reads)

**Strengths**: Lock-free writes (each batch is a new immutable file). DuckDB reads Parquet at near-native speed with predicate pushdown. dbt-duckdb can read Parquet as external sources. Columnar format is ideal for analytical queries.

**Weaknesses**: Requires a compaction strategy — thousands of tiny Parquet files will degrade read performance (filesystem overhead, metadata reads). Writing Parquet from a Node.js web server requires a library (e.g., `parquet-wasm` or `@duckdb/node-neo`). Parquet is not a natural append format; you write complete files, not append rows.

**Verdict**: Good read story, awkward write story for a web server emitting individual events.

### Hybrid: JSONL write / Dagster consolidation / DuckDB read (RECOMMENDED)

**Strengths**:
- **Write path**: Web server appends trace events as JSONL (one file per session, or time-bucketed). JSONL append is trivial in Node.js (`fs.appendFile`), lock-free, and human-readable for debugging.
- **Consolidation**: A Dagster asset reads raw JSONL, validates schema, and writes consolidated Parquet files (partitioned by date/session). This is a natural Dagster job — it's literally what Dagster is built for.
- **Read path**: dbt-duckdb reads the consolidated Parquet via `read_parquet()` glob patterns as external sources. Full analytical query performance with columnar storage and predicate pushdown.
- **Concurrency**: Zero contention. Web server writes JSONL (append-only, no locks). Dagster reads JSONL and writes Parquet (batch job, no contention with web server). dbt reads Parquet via DuckDB (read-only, no contention with anything).
- **Debuggability**: Raw JSONL files are human-readable. You can `cat` a session file and see every event. Parquet files are inspectable via DuckDB CLI.
- **Ecosystem fit**: JSONL is the universal event log format. Parquet is the industry-standard analytical format. DuckDB is the best embedded OLAP engine. dbt-duckdb is a mature, trusted adapter. Dagster has first-class DuckDB and Polars I/O managers.

**Weaknesses**:
- Two-stage pipeline (JSONL -> Parquet -> dbt models) instead of one.
- Raw JSONL is not directly queryable by dbt — requires consolidation first. (But this is a feature: it enforces the Dagster-as-orchestrator pattern.)
- Need to handle JSONL rotation/cleanup (trivial cron or Dagster sensor).

## Recommendation

**Use the hybrid JSONL + DuckDB architecture.**

```
Web Server (Next.js)
    |
    | fs.appendFile() — one JSONL file per session
    v
data/raw/sessions/{session_id}.jsonl     <-- append-only, immutable
    |
    | Dagster asset: consolidate_raw_events
    v
data/warehouse/events/*.parquet           <-- partitioned by date
    |
    | dbt-duckdb: read_parquet('data/warehouse/events/**/*.parquet')
    v
dbt staging -> intermediate -> mart models
    |
    | dbt-duckdb: external materialization
    v
data/exports/training_*.parquet           <-- ML-ready, PII-scrubbed
```

This architecture:
- Separates write concerns (web server) from read concerns (dbt/DuckDB) cleanly
- Uses each tool for what it's best at (JSONL for append, Parquet for analytics, DuckDB for queries)
- Has zero concurrency conflicts by design
- Scales naturally: if volume grows, add more Parquet partitions
- Produces human-readable raw data for debugging
- Keeps the door open for DuckDB-native storage later (if a dedicated write-service ever makes sense)

## Configuration Notes

### JSONL Event Writer (packages/web)

```typescript
// SessionWriter — append trace events to per-session JSONL files
// Location: packages/web/src/lib/session-writer.ts

import { appendFile, mkdir } from 'fs/promises';
import path from 'path';

const RAW_DIR = process.env.TRACE_RAW_DIR || 'data/raw/sessions';

export async function appendTraceEvent(sessionId: string, event: TraceEvent) {
  const dir = path.join(RAW_DIR, sessionId.slice(0, 8)); // date-prefix subdirs
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${sessionId}.jsonl`);
  await appendFile(file, JSON.stringify(event) + '\n');
}
```

### Dagster Consolidation Asset

```python
# Asset: consolidate_raw_events
# Reads JSONL from data/raw/sessions/, writes Parquet to data/warehouse/events/
# Partitioned by date for incremental processing

@asset(
    partitions_def=DailyPartitionsDefinition(start_date="2026-03-01"),
    io_manager_key="parquet_io_manager",
)
def consolidated_events(context) -> pl.DataFrame:
    partition_date = context.partition_key
    jsonl_glob = f"data/raw/sessions/{partition_date[:8]}/*.jsonl"
    # DuckDB can read JSONL natively
    df = pl.read_ndjson(jsonl_glob)
    return df
```

### dbt Profile (profiles.yml)

```yaml
loopcommons:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: data/warehouse/loopcommons.duckdb
      schema: main
      extensions:
        - parquet
      settings:
        # DuckDB only used for reads + dbt model materialization
        # No concurrent write conflict because web server writes JSONL, not DuckDB
        threads: 4
```

### dbt Source Definition (sources.yml)

```yaml
version: 2
sources:
  - name: raw
    schema: main
    tables:
      - name: trace_events
        meta:
          external_location: "read_parquet('data/warehouse/events/**/*.parquet')"
        description: >
          Consolidated trace events from amygdala pipeline.
          Partitioned Parquet files, read via DuckDB glob.
```

### Directory Structure

```
data/
├── raw/
│   └── sessions/          # JSONL files (append-only, immutable)
│       ├── 20260317/
│       │   ├── sess_abc123.jsonl
│       │   └── sess_def456.jsonl
│       └── 20260318/
│           └── ...
├── warehouse/
│   ├── events/            # Consolidated Parquet (written by Dagster)
│   │   ├── date=2026-03-17/
│   │   │   └── part-0.parquet
│   │   └── date=2026-03-18/
│   │       └── part-0.parquet
│   └── loopcommons.duckdb # dbt model materializations only
└── exports/
    └── training/          # ML-ready exports (written by dbt external materialization)
        ├── security_reasoning_v1.parquet
        └── rewrite_pairs_v1.parquet
```

## Sources

- [dbt-duckdb GitHub (DuckDB Labs)](https://github.com/duckdb/dbt-duckdb) — adapter docs, external materialization, plugin system
- [dbt-duckdb v1.10.1 on PyPI](https://pypi.org/project/dbt-duckdb/) — latest release (Feb 2026)
- [dbt-sqlite GitHub](https://github.com/codeforkjeff/dbt-sqlite) — community adapter, limitations
- [DuckDB Concurrency docs](https://duckdb.org/docs/stable/connect/concurrency) — single-writer model, cross-process limitations
- [DuckDB FAQ](https://duckdb.org/faq) — concurrent write limitations are by design
- [SQLite WAL docs](https://www.sqlite.org/wal.html) — concurrent reader/writer behavior
- [Dagster + DuckDB integration](https://docs.dagster.io/integrations/libraries/duckdb) — I/O managers, configuration
- [dagster-duckdb-polars API](https://docs.dagster.io/api/libraries/dagster-duckdb-polars) — Polars DataFrame I/O manager
- [DuckDB Parquet reading docs](https://duckdb.org/docs/stable/data/parquet/overview) — glob patterns, predicate pushdown
- [DuckDB Reading Multiple Files](https://duckdb.org/docs/stable/data/multiple_files/overview) — glob syntax
- [DuckDB EXPORT DATABASE](https://duckdb.org/docs/stable/sql/statements/export) — backup strategy
- [Fully Local Data Transformation with dbt and DuckDB (DuckDB blog, Apr 2025)](https://duckdb.org/2025/04/04/dbt-duckdb) — end-to-end local pipeline
- [DuckDB Live Views over Append-Only Parquet (Jan 2026)](https://medium.com/@hjparmar1944/duckdb-live-views-over-append-only-parquet-streaming-analytics-without-a-stream-processor-6d9aad3de123) — append-only Parquet pattern
- [DuckDB vs SQLite comparison (MotherDuck)](https://motherduck.com/learn-more/duckdb-vs-sqlite-databases/) — OLAP vs OLTP performance
- [dbt-duckdb DuckDB configs (dbt docs)](https://docs.getdbt.com/reference/resource-configs/duckdb-configs) — external sources, configuration
- [Connect DuckDB to dbt Core (dbt docs)](https://docs.getdbt.com/docs/local/connect-data-platform/duckdb-setup) — setup guide
- [SQLite setup for dbt (dbt docs)](https://docs.getdbt.com/docs/core/connect-data-platform/sqlite-setup) — adapter limitations
