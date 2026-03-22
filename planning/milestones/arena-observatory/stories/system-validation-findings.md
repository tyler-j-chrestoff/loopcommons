# System Validation Findings — Session 53

**Date**: 2026-03-22
**Scope**: Full codebase audit. Every API, route, agent tool, security layer, pipeline stage, and CLI path.
**Rule**: No fixes — findings only. Each finding becomes input for future work.

---

## Test Suite Health

| Package | Tests | Passed | Skipped | Failed | Notes |
|---------|-------|--------|---------|--------|-------|
| llm | 1152 | 1122 | 30 | 0 | Skipped tests are conditional (API key, model availability) |
| memory | 141 | 141 | 0 | 0 | Clean |
| web | 614 | 614 | 0 | 1 file error | `api-chat.test.ts` mock mismatch — `createBlogToolPackage` not exported from mock |

---

## Works (Confirmed E2E)

| # | Component | Evidence |
|---|-----------|----------|
| W1 | SSE streaming (chat) | Dual-stream: sanitized to client, raw to disk. Atomic session finalize. |
| W2 | Amygdala pipeline | No tool access (enforced), SOUL.md-grounded, threat score flows to memory layer |
| W3 | Orchestrator routing | Deterministic subagent selection. Threat ≥0.8 forces refusal. Zero LLM cost on refusal. |
| W4 | Memory write threat gating | 4-band system: <0.3 normal, 0.3-0.49 +0.2 uncertainty, ≥0.5 blocked, ≥0.8 refusal |
| W5 | Blog auth boundaries | Triple-layer: NextAuth → orchestrator routing → tool scoping. Non-admin never gets write tools. |
| W6 | Blog slug validation | Regex `^[a-z0-9]+(?:-[a-z0-9]+)*$` prevents path traversal. Tested. |
| W7 | Rate limiting | 5 RPM per-IP, 2 concurrent. Sliding window. Auto-cleanup. Tested. |
| W8 | rawResponse stripping | `sanitizeEvent()` strips rawResponse, system prompt, detailed errors before SSE. |
| W9 | Session persistence | JSONL with atomic .tmp→.jsonl rename. Date-partitioned directories. |
| W10 | Pipeline: session → Parquet | Dagster reads finalized JSONL, skips .tmp, skips malformed lines with audit trail. |
| W11 | Pipeline: dbt models | 12 models (5 staging → 2 intermediate → 3 training → 2 metrics). Valid DuckDB SQL. |
| W12 | Pipeline: training export | Versioned JSONL with SHA256 checksums in sidecar files. |
| W13 | Arena: tournament start | POST with validation, 409 on concurrent tournament, fire-and-forget background. |
| W14 | Arena: SSE stream | TransformStream with proper cleanup on disconnect. Auto-close on terminal events. |
| W15 | Arena: encounter replay | Trace files persisted per-encounter. Step timeline renders from metadata + steps. |
| W16 | Arena: graveyard | Death records from traces, interestingness scoring, epitaph generation, paginated API. |
| W17 | Arena: tournament persistence | JSONL per-tournament (generations, events, traces). Rehydrated on cold start. |
| W18 | Arena: past tournaments list | Reads disk, sorts by mtime, 30s cache. UI renders clickable list. |
| W19 | Tit-for-tat refusal | Static response, zero LLM cost, silence on repeat adversarial. |
| W20 | Amygdala injection defense | 5/6 patterns caught in red-team tests. Threat score blocks tool access even on bypass. |

---

## Dark (Exists but Unreachable or Hidden)

| # | Component | Severity | Description |
|---|-----------|----------|-------------|
| D1 | `GET /api/health` | Low | Public health endpoint. No UI caller. Likely infra-only. |
| D2 | `GET /api/memory` | Low | Admin memory inspection. No UI caller. Curl/CLI-only access. |
| D3 | `GET /api/metrics/arena` | Low | Legacy arena metrics endpoint. Replaced by `/api/metrics/arena-tournament`. No UI caller. |
| D4 | `GET /api/arena/encounters` | Medium | Encounter listing endpoint. No UI to browse/manage encounters. |
| D5 | `POST /api/arena/encounters` | Medium | Encounter creation endpoint. No UI. Can only be called via curl. |
| D6 | `/login` route | Low | Exists but not linked from any navigation. Access via NextAuth redirect or direct URL. |
| D7 | Security subagent | Low | Routes to empty toolset. Can discuss security but can't invoke any tools. By design. |
| D8 | Arena query tools in CLI | Medium | `queryTournament`, `listTournaments`, `compareFitness` — chat-only, completely absent from CLI. |
| D9 | Memory recall pre-amygdala | Medium | Memory recalled before threat score exists. Reads aren't threat-gated. Asymmetric with write gating. |

---

## Broken

| # | Component | Severity | Description |
|---|-----------|----------|-------------|
| B1 | Heatmap on cold start | **High** | `taskResults` (per-encounter scores) not persisted to `generations.jsonl`. After server restart, heatmap is empty for all historical tournaments. Data exists in trace files but no rehydration path. The hero component on `/arena` is broken for any non-live tournament. |
| B2 | `api-chat.test.ts` | Medium | Test file fails due to mock mismatch: `createBlogToolPackage` not exported from `@/tools/blog` mock. 614 individual tests pass; this is a file-level import error. CI may be masking this. |

---

## Surprising (Unexpected Behavior Worth Noting)

| # | Component | Severity | Description |
|---|-----------|----------|-------------|
| S1 | CLI has no rate limiting | Medium | No RPM limit, no concurrent limit, no daily spend cap. Unbounded LLM cost. |
| S2 | CLI has no input sanitization | Medium | No invisible char stripping, no unicode normalization, no role-spoofing detection. |
| S3 | CLI doesn't stream | Low | `stream: false` — blocks on full response. Web streams SSE events. |
| S4 | CLI sessions flat directory | Low | No date-based partitioning. Web uses `YYYY-MM-DD/` subdirectories. |
| S5 | Raw tool errors to disk | Medium | `sanitizeEvent` redacts errors for client but raw errors (potentially containing secrets) persisted to training data JSONL. Pipeline must not leak these. |
| S6 | System prompt in trace files | Low | Stripped from client SSE but persisted raw to disk. Intentional (training data needs context) but exposes derived prompts to anyone reading JSONL. |
| S7 | Injection-as-quoted-example | Medium | Known bypass: framing injection as "what would happen if..." lets payload reach subagent prompt. Threat score still catches it (≥0.4) so tools are blocked. Documented in CLAUDE.md. |
| S8 | Blog variant always 'writer' in web | Low | Web route assembles blog as `variant: 'writer'` always. Auth gating happens at orchestrator level, not tool assembly. Means write tool definitions are in memory even for non-admins (just unreachable via routing). |
| S9 | Two epitaph generators | Low | `FeaturedDeath.tsx` (live tournament) and `graveyard.ts` (historical) use different interestingness formulas. Not wrong, but could diverge further. |
| S10 | Rate limit resets on restart | Low | In-memory only. Process restart clears all tracking. Acceptable for single-instance Railway deploy. |

---

## Inventory Summary

| Category | Count | Details |
|----------|-------|---------|
| API endpoints | 21 | 5 dark (no UI caller) |
| Frontend routes | 6 | 1 unlinked (`/login`) |
| Agent tools | 20 | 5 arena-sandbox-only, 3 chat-only (no CLI) |
| Subagents | 7 | 1 empty toolset (security) |
| ToolPackages | 6 | resume, project, blog, memory, arena-query, arena-sandbox |
| Pipeline models | 12 | 5 staging, 2 intermediate, 3 training, 2 metrics |
| Test suites | 3 | ~1877 tests total (1122 + 141 + 614) |

---

## Priority Actions for Future Sessions

1. **B1 — Heatmap rehydration**: Reconstruct `taskResults` from trace files on tournament detail load. High impact, data already exists.
2. **B2 — Fix api-chat.test.ts mock**: Add `createBlogToolPackage` to the mock exports.
3. **D4/D5 — Encounter management UI**: The encounter CRUD endpoints exist but have no frontend. Needed before arena-platform science.
4. **S1/S2 — CLI hardening**: If CLI is meant for more than local dev, it needs rate limiting and input sanitization.
5. **S5 — Raw error audit**: Verify pipeline doesn't export raw tool errors containing secrets to training JSONL.
