# Story: System Validation

**Persona**: As the builder, I need to know what actually works end-to-end across the entire platform — what's solid, what's dark, what's broken — so I can trust the foundation before building the next layer.

**Status**: planned

**Context**: 52 sessions shipped the full stack in rapid succession: agent engine, amygdala, memory, blog CMS, arena, tournament system, pipeline, deployment. At that pace, seams between components go untested. This is the first whole-system audit — not unit tests (we have ~1770) but end-to-end validation of every user-reachable path and an inventory of capabilities that exist in code but have no path to reach them.

**Acceptance criteria**:
- Complete inventory of all API endpoints, frontend routes, CLI capabilities, and agent tools
- Every dark feature (exists in code, no user path) identified and catalogued
- Core flows exercised end-to-end: chat, arena lifecycle, blog CMS, memory, auth
- Security spot-check: rate limiting, amygdala, auth gating, memory threat bands
- Pipeline check: session JSONL → Dagster → Parquet export path validated
- Findings categorized as: works / dark / broken / surprising
- No fixes in this session — findings become input for future work

## Tasks

```jsonl
{"id":"sv-01","title":"Inventory: enumerate all API endpoints","type":"research","status":"planned","description":"Grep all route.ts/route.tsx files and API handlers. List every endpoint with method, path, auth requirement, and whether it has a frontend caller. Flag endpoints with no UI path.","estimate":"25min","deps":[],"prereqs":[]}
{"id":"sv-02","title":"Inventory: enumerate frontend routes and agent tools","type":"research","status":"planned","description":"List all Next.js pages/routes and all registered agent tools (ToolPackages). Cross-reference: which tools are exercisable from chat? From CLI? From arena? Which pages exist but aren't linked from navigation?","estimate":"20min","deps":[],"prereqs":[]}
{"id":"sv-03","title":"Live walkthrough: chat and agent capabilities","type":"test","status":"planned","description":"Exercise a real conversation on live deployment (or local). Verify: SSE streaming works, amygdala fires and is visible in inspector, orchestrator routes correctly, memory recall and write work, tool calls execute. Document any failures.","estimate":"25min","deps":["sv-01","sv-02"],"prereqs":["local dev server or Railway deployment accessible"]}
{"id":"sv-04","title":"Live walkthrough: arena lifecycle","type":"test","status":"planned","description":"Full arena flow: start tournament, watch SSE stream, see results in heatmap, click cell for encounter replay, check graveyard. Verify tournament persistence (restart server, data still there). Verify past tournaments list. Document any failures.","estimate":"25min","deps":["sv-01"],"prereqs":["at least one completed tournament on disk"]}
{"id":"sv-05","title":"Live walkthrough: blog CMS and auth boundaries","type":"test","status":"planned","description":"Verify: unauthenticated user sees blog posts but no write tools. Authenticated admin gets write tools. Create/edit/delete a test post. Verify slug validation and path traversal prevention. Document any failures.","estimate":"15min","deps":["sv-01"],"prereqs":["auth credentials available"]}
{"id":"sv-06","title":"Security spot-check","type":"test","status":"planned","description":"Quick probes: rate limiting fires at 5 RPM, concurrent limit works, amygdala catches obvious injection, memory write blocked at threat >= 0.5, rawResponse stripped from output, non-admin never gets write tools. Not a full pentest — just verify the 5 layers aren't silently broken.","estimate":"20min","deps":["sv-03"],"prereqs":[]}
{"id":"sv-07","title":"Pipeline integrity check","type":"test","status":"planned","description":"Verify the full data path: session JSONL files are well-formed, Dagster can read them, dbt models run, Parquet output is valid, training export produces versioned JSONL with checksums. If any step fails, document where the chain breaks.","estimate":"20min","deps":[],"prereqs":["Python env with dagster/dbt available"]}
{"id":"sv-08","title":"CLI parity check","type":"test","status":"planned","description":"Exercise scripts/chat.ts CLI. Verify: agent responds, tools work, memory persists, amygdala reasoning happens. Compare capability surface to web UI — what can web do that CLI can't? Document gaps.","estimate":"15min","deps":["sv-02"],"prereqs":[]}
{"id":"sv-09","title":"Findings report","type":"research","status":"planned","description":"Compile all findings into categorized list: works (confirmed E2E), dark (exists but unreachable), broken (fails), surprising (unexpected behavior). Each finding gets a one-line description and severity. This becomes input for future session planning.","estimate":"15min","deps":["sv-03","sv-04","sv-05","sv-06","sv-07","sv-08"],"prereqs":[]}
```
