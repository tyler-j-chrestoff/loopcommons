# Roadmap

Loop Commons is a live research platform and open-source training data pipeline. A substrate-aware conversational agent that defends itself through self-knowledge, with every decision traced, visualized, and exported as labeled training data for open-source language models.

**Active milestone**: none — planning next milestone.

## Now

- **eval-hooks completion** — Remaining eval-hooks gates: feedback data flows through pipeline to training export, evaluation dashboard. 2 open gates.

## Next

## Done

- **[seasonal-theme](milestones/seasonal-theme/)** — CVNP-inspired seasonal palette system. Spring theme: Literata serif for blog, everforest-light code blocks, warm light mode. Season picker with localStorage persistence. 1 story (8 tasks), 1 session. Completed 2026-03-18.
- **[auto-calibration](milestones/auto-calibration/)** — Automated amygdala prompt optimization (propose/test/keep/revert). Bayesian Pareto constraints, calibration history viz, thinking tag filter. 2 stories (15 tasks), 2 sessions. Completed 2026-03-18.
- **[blog-tools](milestones/blog-tools/)** — Agent-as-CMS blog with auth-gated write tools. The first real security boundary. 4 stories (25 tasks), 2 sessions. Completed 2026-03-18.
- **[eval-hooks](milestones/eval-hooks/)** — User feedback, LLM-as-judge, CI eval regression testing. 3 stories (22 tasks), 2 sessions. Core complete 2026-03-18 (6/8 gates; 2 remaining gates moved to backlog).
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
