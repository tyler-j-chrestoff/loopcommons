# Roadmap

Loop Commons is a live research platform and open-source training data pipeline. A substrate-aware conversational agent that defends itself through self-knowledge, with every decision traced, visualized, and exported as labeled training data for open-source language models.

**Active milestone**: [memory-packages](milestones/memory-packages/) — Composable memory as the pilot for tool packages. ToolPackage interface, keyword strategy (A), embedding strategy (B), admin API. 2 stories (10 tasks), 2 sessions.

## Now

- **[memory-packages](milestones/memory-packages/)** — Extract memory into a composable tool package. Keyword recall (Package A) + embedding recall (Package B) behind a shared ToolPackage interface. Proves the tools-as-ontology pattern.
- **eval-hooks completion** — Remaining eval-hooks gates: feedback data flows through pipeline to training export, evaluation dashboard. 2 open gates.

## Next

## Done

- **[agent-identity](milestones/agent-identity/)** — Amygdala rewritten from security classifier to identity/alignment monitor. SOUL.md soul document, subagent-driven memory writes (Option C), hippocampal consolidation, ACC conflict detection, 3-part blog series. 2 stories (10 tasks), 2 sessions. Completed 2026-03-19.
- **[agent-memory](milestones/agent-memory/)** — Persistent agent world model. Capsule-shaped entries (observation/learning/relationship/reflection) with SDI-compatible envelope. Amygdala-mediated memory write gating. MemoryInspector viz. 2 stories (12 tasks), 2 sessions. Completed 2026-03-19.
- **[seasonal-theme](milestones/seasonal-theme/)** — CVNP-inspired seasonal palette system. Spring theme: Literata serif for blog, everforest-light code blocks, warm light mode. Season picker with localStorage persistence. 1 story (8 tasks), 1 session. Completed 2026-03-18.
- **[auto-calibration](milestones/auto-calibration/)** — Automated amygdala prompt optimization (propose/test/keep/revert). Bayesian Pareto constraints, calibration history viz, thinking tag filter. 2 stories (15 tasks), 2 sessions. Completed 2026-03-18.
- **[blog-tools](milestones/blog-tools/)** — Agent-as-CMS blog with auth-gated write tools. The first real security boundary. 4 stories (25 tasks), 2 sessions. Completed 2026-03-18.
- **[eval-hooks](milestones/eval-hooks/)** — User feedback, LLM-as-judge, CI eval regression testing. 3 stories (22 tasks), 2 sessions. Core complete 2026-03-18 (6/8 gates; 2 remaining gates moved to backlog).
- **[context-budget-viz](milestones/context-budget-viz/)** — Novel real-time context window budget visualization. 2 stories, 12 tasks, 2 sessions. Completed 2026-03-18.
- **[deploy-ops](milestones/deploy-ops/)** — Deploy to Railway, session linking, web test expansion. 3 stories, 24 tasks, 2 sessions. Completed 2026-03-18.
- **[amygdala](milestones/amygdala/)** — Metacognitive security architecture + open-source training data pipeline. Substrate-aware amygdala layer rewrites/routes to least-privilege subagents. Session persistence. Dagster+dbt pipeline exports labeled training data. Full pipeline visualization. 5 stories, 35 tasks, 5 sessions. Completed 2026-03-18.
- **[hardening](milestones/hardening/)** — Rate limiting, daily spend cap, prompt injection defense. 3 stories, 16 tasks, 2 sessions. Completed 2026-03-17.
- **[agent-tools-streaming](milestones/agent-tools-streaming/)** — Real tools, token streaming, security fixes. Completed 2026-03-16.

## Next (Tools-as-Ontology Trajectory)

Phases 2-5 of the trajectory defined in `milestones/agent-memory/designs/tools-as-ontology.md`. Each phase is independently useful and enables the next. Memory-packages is the Phase 2 pilot — prove the pattern with the most complex tool, then generalize.

- **Tools as Packages (generalize)** — Extract blog, resume, project tools using the pattern proven by memory-packages. Enrich tool metadata (intent, cost, boundary constraints). Prerequisite for derived prompts and multi-interface.
- **Derived System Prompts** — Generate system prompts from tool composition + authored domain knowledge. Subagent configs use derived prompts. Prerequisite for arena.
- **Multi-Interface Identity** — Agent operates on web + Reddit/HN/CLI with shared persistent state and tool set. Each interface is a thin adapter.
- **Evolutionary Agent Arena** — Spawn agents with random tool compositions, let them learn/teach/compete, select for fitness. See `suggestions/evolutionary-agent-arena.md`.

## Later

Items assessed in session 10 (2026-03-17). These remain valid but are independent of the tools-as-ontology trajectory.

- **Context engineering** (pruning, sliding window, summarization) — Ready to plan. May interact with memory recall (memory is context). Low-medium complexity.
- **Trace comparison and replay** — Ready to plan. Custom JSONL diff viewer. Medium complexity.
- **A/B testing infrastructure** — Needs eval-hooks completion. Medium complexity.
- **Multi-provider routing** — Basic is a config change in AI SDK v6. Low → medium complexity.
- **Query API and data governance** — Not yet researched.
- **Agent tool access to this planning system** — Not yet researched.
- **Unsloth Studio fine-tuning** — Needs more training data volume. Deferred. See `suggestions/unsloth-studio-finetuning.md`.

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
