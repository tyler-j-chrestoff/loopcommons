# Story: Daily Spend Cap

> As **Tyler (the person paying the Anthropic bill)**, I want the site to stop making API calls after a daily cost threshold so I never wake up to a surprise bill. Users see a friendly "come back tomorrow" message instead of an error.

## Acceptance Criteria

- Track cumulative daily spend from `calculateCost` results (in-memory counter, resets at midnight UTC)
- When daily cap is reached, `/api/chat` returns a friendly message without calling Anthropic
- Cap is configurable via `DAILY_SPEND_CAP_USD` env var (default: $5.00)
- Current spend is visible in trace data (optional: surface in UI)
- Logging when cap is hit (so Tyler knows to adjust if legitimate traffic is being blocked)

## Tasks

```jsonl
{"id":"harden-05","story":"spend-cap","description":"Research: how do other open-source LLM chat apps handle spend caps and budget controls? Check Anthropic API docs for built-in usage limits or budget features. Evaluate whether to track cost server-side only or also leverage provider-side controls. Document findings.","depends_on":[],"status":"pending"}
{"id":"harden-06","story":"spend-cap","description":"Create a SpendTracker module: accumulate cost per UTC day, expose canSpend() and recordSpend(cost) methods. Configurable via DAILY_SPEND_CAP_USD (default $5). Approach informed by harden-05 research.","depends_on":["harden-05"],"status":"pending"}
{"id":"harden-07","story":"spend-cap","description":"Integrate SpendTracker in route.ts: check canSpend() before calling agent(), call recordSpend() after trace:complete. Return friendly 503 JSON when cap is hit.","depends_on":["harden-06"],"status":"pending"}
{"id":"harden-08","story":"spend-cap","description":"Red-team: set cap to $0.01, send requests until cap triggers, verify friendly response and that no further Anthropic calls are made. Reset and verify normal operation resumes.","depends_on":["harden-07"],"requires":["ANTHROPIC_API_KEY"],"status":"pending"}
```
