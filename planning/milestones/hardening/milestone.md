# Milestone: Hardening — Cost Control, Abuse Prevention, Prompt Security

**Status**: planned

## Summary

The agent is live with Tyler's API key behind a public endpoint. There is no rate limiting, no spend cap, and minimal prompt injection defense. This milestone closes the gaps that could cost real money or misrepresent Tyler before the site goes to a live URL.

## Verification Gate

All of these must pass before this milestone is complete:

- [ ] Per-IP rate limiter rejects excessive requests (verify with rapid curl loop)
- [ ] Daily spend cap halts requests after threshold, returns friendly message
- [ ] Concurrent request limit prevents parallel abuse
- [ ] System prompt includes injection-resistant instructions
- [ ] Red-team prompt injection attempts fail (model refuses to break character)
- [ ] Input content is sanitized (no role spoofing via message array manipulation)
- [ ] Error responses do not leak implementation details
- [ ] All defenses work without degrading normal UX

## Stories

```
ls planning/milestones/hardening/stories/
```

| Story | Persona | Summary |
|-------|---------|---------|
| [rate-limiting](stories/rate-limiting.md) | Attacker / normal user | Research SotA, then per-IP rate limits and concurrent request caps |
| [spend-cap](stories/spend-cap.md) | Tyler (bill payer) | Research approaches, then daily spend ceiling with graceful degradation |
| [prompt-hardening](stories/prompt-hardening.md) | Attacker / hiring manager | Research OWASP/Anthropic guidance, then injection-resistant prompt and input sanitization |
