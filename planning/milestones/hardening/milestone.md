# Milestone: Hardening — Cost Control, Abuse Prevention, Prompt Security

**Status**: done

## Summary

The agent is live with Tyler's API key behind a public endpoint. There is no rate limiting, no spend cap, and minimal prompt injection defense. This milestone closes the gaps that could cost real money or misrepresent Tyler before the site goes to a live URL.

## Verification Gate

All of these must pass before this milestone is complete:

- [x] Per-IP rate limiter rejects excessive requests (verify with rapid curl loop)
- [x] Daily spend cap halts requests after threshold, returns friendly message
- [x] Concurrent request limit prevents parallel abuse
- [x] System prompt includes injection-resistant instructions
- [x] Red-team prompt injection attempts fail (model refuses to break character)
- [x] Input content is sanitized (no role spoofing via message array manipulation)
- [x] Error responses do not leak implementation details
- [x] All defenses work without degrading normal UX
- [x] Rate limit state (remaining requests, active connections) is visible in the UI
- [x] Spend vs. cap budget gauge is visible and updates in real-time
- [x] Security events (rejections, sanitizations) are observable in TraceInspector

## Stories

```
ls planning/milestones/hardening/stories/
```

| Story | Persona | Summary |
|-------|---------|---------|
| [rate-limiting](stories/rate-limiting.md) | Attacker / normal user | Research SotA, then per-IP rate limits and concurrent request caps |
| [spend-cap](stories/spend-cap.md) | Tyler (bill payer) | Research approaches, then daily spend ceiling with graceful degradation |
| [prompt-hardening](stories/prompt-hardening.md) | Attacker / hiring manager | Research OWASP/Anthropic guidance, then injection-resistant prompt and input sanitization |
