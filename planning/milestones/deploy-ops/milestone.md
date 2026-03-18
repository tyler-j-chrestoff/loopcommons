# Milestone: Deploy + Ops

**Status**: done

## Summary

Get Loop Commons live on a public URL. Deploy to Railway with persistent storage for session data, add session linking for multi-turn conversation threads, and expand web-side test coverage to match the llm package's maturity.

This is the operational foundation — everything after this (context viz, eval hooks, calibration) benefits from being testable against a live deployment.

## Architecture

```
Railway ($5/mo)
├── packages/web (Next.js, App Router)
│   ├── Persistent volume: /data/sessions/
│   ├── Env: ANTHROPIC_API_KEY, RATE_LIMIT_RPM, DAILY_SPEND_CAP_USD
│   └── Domain: loopcommons.com or similar
├── Full amygdala pipeline (amygdala → orchestrator → subagent)
└── SSE streaming (no duration limits on Railway)
```

Session linking adds a `parentSessionId` field to connect conversations:
```
Session A (initial visit)
  └── Session B (return visit, links to A)
       └── Session C (continuation, links to B)
```

## Verification Gate

- [x] App accessible at public URL (session 11)
- [x] Persistent volume survives container restarts (session 11)
- [x] Amygdala pipeline works in production (session 11)
- [x] Rate limiting and spend cap functional in production (session 11)
- [x] Session linking: new sessions can reference a parent session ID (session 12)
- [x] Session thread visible in UI (linked conversation chain) (session 12)
- [x] Web test coverage ≥80% of routes and lib modules (session 12: 86.7% lines, 91.4% lib stmts)
- [x] CI passes on all PRs (session 11)

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [railway-deploy](stories/railway-deploy.md) | Tyler (operator) | Deploy to Railway with persistent volumes and production config |
| [session-linking](stories/session-linking.md) | Returning visitor | Connect multi-turn conversations with parent session references |
| [web-test-expansion](stories/web-test-expansion.md) | Tyler (maintainer) | Expand web test coverage to match llm package maturity |
