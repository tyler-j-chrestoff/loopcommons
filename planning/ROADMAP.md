# Roadmap

Loop Commons is an observability-first conversational agent — every data point from the LLM interaction is captured, visualized, and eventually queryable.

**Active milestone**: [milestones/hardening/](milestones/hardening/) — start here.

## Now

- **[hardening](milestones/hardening/)** — Rate limiting, daily spend cap, prompt injection defense. Must ship before deploying to a live URL.

## Next

- Context window budget visualization — novel, no widely-used tool does this
- Trace export (JSON download) — unlocks offline analysis
- PersistenceCollector (SQLite) — foundation for data platform
- Session linking — connect multi-turn conversations
- Web-side tests — llm has 8, web has 0
- Deploy to live URL

## Done

- **[agent-tools-streaming](milestones/agent-tools-streaming/)** — Real tools, token streaming, security fixes. Completed 2026-03-16.

## Later

- Trace comparison and replay
- Evaluation hooks (LLM-as-judge, user feedback)
- Context engineering (pruning, sliding window, summarization)
- A/B testing infrastructure
- Query API and data governance
- Multi-provider routing
- Agent tool access to this planning system (read roadmap, add suggestions, report status)

## Suggestions

Individual suggestion files live in `planning/suggestions/`. To add one:

```bash
cat > planning/suggestions/my-feature.md << 'EOF'
# Suggestion: My Feature
**Source**: user conversation, 2026-03-16
**Description**: What the feature does and why it matters.
EOF
```

Promoted to stories in a milestone when ready.
