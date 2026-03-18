# Roadmap

Loop Commons is a live research platform and open-source training data pipeline. A substrate-aware conversational agent that defends itself through self-knowledge, with every decision traced, visualized, and exported as labeled training data for open-source language models.

**Active milestone**: [eval-hooks](milestones/eval-hooks/) — User feedback collection, LLM-as-judge scoring, CI eval regression testing.

## Now

- **[eval-hooks](milestones/eval-hooks/)** — User feedback collection, LLM-as-judge scoring, CI eval regression testing. Foundation for A/B testing and cost routing. 3 stories, 22 tasks.

## Next

- **[auto-calibration](milestones/auto-calibration/)** — Automated amygdala prompt optimization (propose/test/keep/revert). Inspired by Karpathy's autoresearch. ~$2-8 per run. 2 stories, 15 tasks.

## Done

- **[context-budget-viz](milestones/context-budget-viz/)** — Novel real-time context window budget visualization. 2 stories, 12 tasks, 2 sessions. Completed 2026-03-18.
- **[deploy-ops](milestones/deploy-ops/)** — Deploy to Railway, session linking, web test expansion. 3 stories, 24 tasks, 2 sessions. Completed 2026-03-18.
- **[amygdala](milestones/amygdala/)** — Metacognitive security architecture + open-source training data pipeline. Substrate-aware amygdala layer rewrites/routes to least-privilege subagents. Session persistence. Dagster+dbt pipeline exports labeled training data. Full pipeline visualization. 5 stories, 35 tasks, 5 sessions. Completed 2026-03-18.
- **[hardening](milestones/hardening/)** — Rate limiting, daily spend cap, prompt injection defense. 3 stories, 16 tasks, 2 sessions. Completed 2026-03-17.
- **[agent-tools-streaming](milestones/agent-tools-streaming/)** — Real tools, token streaming, security fixes. Completed 2026-03-16.

## Later

Items assessed in session 10 (2026-03-17). Readiness notes from research:

- **Context engineering** (pruning, sliding window, summarization) — Ready to plan. No AI SDK built-in support. Start simple: sliding window → summarization buffer → relevance scoring. Low-medium complexity.
- **Trace comparison and replay** — Ready to plan. Custom JSONL diff viewer (no new infra) preferred over Langfuse integration. Medium complexity.
- **A/B testing infrastructure** — Needs eval-hooks first (can't measure which variant "won" without scoring). No purpose-built OSS framework exists. Medium complexity.
- **Multi-provider routing** — Basic (provider-per-subagent) is a config change in AI SDK v6. Cost-based dynamic routing needs eval hooks. Low → medium complexity.
- **Query API and data governance** — Not yet researched.
- **Agent tool access to this planning system** — Not yet researched.
- **Unsloth Studio fine-tuning** — Needs more training data volume (~40 sessions currently). Deferred. See `planning/suggestions/unsloth-studio-finetuning.md`.

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
