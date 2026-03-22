# Milestone: Arena Observatory

**Claim tested**: The data is self-explanatory — a visitor can understand agent evolution through the traces alone, no explainer text needed.

**Depends on**: arena-platform stories 1-3 (SSE streaming, queryArena ToolPackage, encounter DSL — shipped session 48)

## Stories

1. [step-traces](stories/step-traces.md) — Persist per-agent per-encounter step traces via executeEncounter callback
2. [tournament-browser](stories/tournament-browser.md) — /arena shows latest tournament, past list, agent×encounter heatmap
3. [encounter-replay](stories/encounter-replay.md) — Click a heatmap cell, watch the agent think step by step
4. [the-graveyard](stories/the-graveyard.md) — Dead agents as first-class content, shareable death cards
5. [chat-traces](stories/chat-traces.md) — Chat sessions in the same observatory (deferred — ships after tournament format is proven)

## Design Principles

- **Show don't tell**: no explainer paragraphs. The heatmap, the death markers, the tool call replay — they ARE the explanation.
- **Progressive disclosure**: landing → heatmap → cell → replay → raw trace. Each click goes deeper.
- **Failure is the hero**: dead agents are more prominent than winners. They map the fitness landscape.
- **Two audiences, one view**: a Twitter visitor gets the narrative, a researcher gets the data. Same page, click deeper.

## Key Concepts

- **Featured Death**: auto-selected most interesting death (longest trace × lowest score = highest "potential wasted")
- **Epitaph**: one-line summary derived from trace ("Had [inspect, model]. Couldn't act on what it knew.")
- **Shareable card**: screenshot-friendly death summary with replay link
