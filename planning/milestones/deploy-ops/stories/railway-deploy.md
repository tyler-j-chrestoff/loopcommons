# Story: Railway Deploy

> As **Tyler (operator)**, I want to deploy Loop Commons to Railway so that the platform is publicly accessible, with persistent session storage and production-ready configuration.

## Acceptance Criteria

- App deployed and accessible at a public URL
- Persistent volume mounted at `/data/sessions/` so session JSONL files survive container restarts
- Environment variables configured: `ANTHROPIC_API_KEY`, `RATE_LIMIT_RPM`, `DAILY_SPEND_CAP_USD`
- Full amygdala pipeline works end-to-end in production (amygdala -> orchestrator -> subagent)
- Health check endpoint responds at `/api/health` for Railway's built-in health monitoring
- Build and deploy automated from `main` branch (Railway GitHub integration)
- Rate limiting and spend cap functional in production

## Architecture

```
Railway Project
├── Service: loopcommons-web
│   ├── Build: Nixpacks (auto-detected from package.json)
│   ├── Start: npm run start --workspace=packages/web
│   ├── Volume: /data/sessions/ (persistent)
│   ├── Env: ANTHROPIC_API_KEY, RATE_LIMIT_RPM, DAILY_SPEND_CAP_USD, NODE_ENV=production
│   ├── Health check: GET /api/health (200 OK)
│   └── Domain: *.up.railway.app (custom domain optional)
└── GitHub: auto-deploy on push to main
```

## Tasks

```jsonl
{"id":"ops-01","story":"railway-deploy","description":"Research: verify Railway Nixpacks build for Next.js 16 monorepo. Check if Nixpacks auto-detects the monorepo structure or needs a custom build command. Confirm persistent volume mount semantics (symlink vs bind mount, write permissions). Check Railway health check config options. Document findings with links to Railway docs.","depends_on":[],"requires":["Railway account"],"status":"pending"}
{"id":"ops-02","story":"railway-deploy","description":"Create health check endpoint at packages/web/src/app/api/health/route.ts. GET returns 200 with JSON body {status: 'ok', timestamp: ISO string}. Keep it minimal — no DB calls, no external deps. Add to CI typecheck.","depends_on":[],"requires":[],"status":"pending"}
{"id":"ops-03","story":"railway-deploy","description":"Configure Railway project: create service from GitHub repo, set root directory to repo root, set build command (npm install && npm run build --workspace=packages/web), set start command (npm run start --workspace=packages/web). Configure based on ops-01 research findings. Set NODE_ENV=production.","depends_on":["ops-01"],"requires":["Railway account","GitHub repo access"],"status":"pending"}
{"id":"ops-04","story":"railway-deploy","description":"Configure persistent volume on Railway: mount at /data/sessions/ (or wherever FileSessionWriter writes). Verify the volume path matches SESSION_DATA_DIR or the default path in session-writer.ts. If the app uses a relative path like data/sessions/, add a SESSION_DATA_DIR env var pointing to the absolute mount path.","depends_on":["ops-03"],"requires":["Railway account"],"status":"pending"}
{"id":"ops-05","story":"railway-deploy","description":"Set environment variables on Railway: ANTHROPIC_API_KEY, RATE_LIMIT_RPM (5), DAILY_SPEND_CAP_USD (1.00), NODE_ENV (production). Verify the app reads these correctly at runtime. Confirm no env vars are hardcoded or missing.","depends_on":["ops-03"],"requires":["Railway account","ANTHROPIC_API_KEY"],"status":"pending"}
{"id":"ops-06","story":"railway-deploy","description":"Configure Railway auto-deploy from main branch. Set up GitHub integration so pushes to main trigger builds. Verify CI passes before Railway deploys (Railway watches the branch, CI is separate — both must pass). Set health check path to /api/health in Railway service settings.","depends_on":["ops-02","ops-03"],"requires":["Railway account","GitHub repo access"],"status":"pending"}
{"id":"ops-07","story":"railway-deploy","description":"Production smoke test: after first deploy, verify (1) public URL loads the chat UI, (2) send a test message and confirm amygdala pipeline works end-to-end (check for amygdala trace events in response), (3) verify session JSONL was written to persistent volume, (4) restart the container and confirm session files persist, (5) verify rate limiting works (send 6 requests in 1 minute), (6) check /api/health returns 200.","depends_on":["ops-04","ops-05","ops-06"],"requires":["Railway account","ANTHROPIC_API_KEY"],"status":"pending"}
{"id":"ops-08","story":"railway-deploy","description":"Configure custom domain (optional): if domain is available, add it in Railway settings and configure DNS. Otherwise, document the Railway-provided URL in CLAUDE.md. Update CLAUDE.md with the production URL and any deployment notes regardless.","depends_on":["ops-07"],"requires":["Domain (optional)"],"status":"pending"}
```
