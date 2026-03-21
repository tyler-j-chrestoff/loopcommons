# Design: Arena Trace Visualization

**Status**: Draft — informs rl-13 through rl-16 (session 41)

## Core Insight

A trace is not a log. It's a timeline of an agent's changing relationship with its environment. At every point there are three things:

1. **What the agent knows** — accumulated observations from tool calls
2. **What the agent can do** — current tools, constraints
3. **What the world looks like** — the sandbox ground truth

The gap between 1 and 3 is where all behavior lives. The agent always operates on incomplete information. The viz makes that gap visible.

## Layout

Four panels, one timeline:

```
┌─────────────────────────────────────────────────────────────┐
│  Timeline (horizontal, zoomable, clickable)                 │
│  ●──◆──■──○──○──○──◆──■──○──○──■──○──◆──■──○──○──■──●      │
│  start    encounter steps       crossroads         end      │
├──────────────────────┬──────────────────────────────────────┤
│  Agent Mind          │  Sandbox World                       │
│  (left panel)        │  (right panel)                       │
├──────────────────────┴──────────────────────────────────────┤
│  Event Detail (bottom panel, expandable)                    │
└─────────────────────────────────────────────────────────────┘
```

### Timeline

Horizontal event stream. Each event is a node, colored and shaped by type:

| Shape | Event type | Color |
|-------|-----------|-------|
| ● | `run:header`, `run:complete` | green |
| ◆ | `choice:point` | yellow |
| ■ | `encounter:start`, `encounter:result` | purple |
| ○ | `encounter:step` | cyan (inspect), red (act), yellow (search), magenta (model) |
| ○ | `agent:response` | green |
| 💀 | `run:death` | red |

Click any node to jump. Hover for preview tooltip. The timeline is the primary navigation — arrow keys step through, but you can also click directly.

Zoom: scroll to zoom in/out. At full zoom, every step is visible. Zoomed out, encounters collapse to single blocks.

### Agent Mind (left panel)

Shows only what the agent has actually observed. Updated incrementally as you step through.

**Sections:**

- **Tools** — current tool list. New acquisitions flash green, drops flash red.
- **Knowledge** — accumulated facts from tool outputs, grouped by encounter. Each fact is a collapsible card showing the tool call that produced it. New facts highlight when the step that produced them is active.
- **Identity** — state hash + chain hash. Updates at crossroads. Shown as a subtle "DNA strand" — a vertical strip of colored blocks, one per state hash in the chain.

**Fog of war**: items the agent has NOT observed are absent from this panel entirely. The agent mind only contains what tools have returned.

### Sandbox World (right panel)

Shows the full ground truth, regardless of what the agent has seen.

**Sections:**

- **Files** — tree view of sandbox.files. Expandable. Syntax-highlighted content.
- **Services** — cards per service: status badge, config, metrics, recent logs.
- **Dependencies** — small graph visualization of sandbox.dependencyGraph.
- **Command Log** — list of commands the agent has executed via `act`.

**Fog of war**: items the agent HAS inspected get a green "observed" badge. Items it hasn't are dimmed (but visible — the researcher can see the ground truth). This creates a visual contrast: the left panel is the agent's model, the right panel is reality. The gap between them is the interesting part.

### Event Detail (bottom panel)

Expands to show full content for the selected event:

- **choice:point**: full crossroads prompt (the text the LLM received), full raw XML response, parsed decision with confidence. Two-column layout: prompt on left, response on right.
- **encounter:start**: the problem statement given to the agent. Highlighted sections that hint at the root cause (for researcher annotation, not shown to agent).
- **encounter:step**: tool name, input args, full output. For `inspect`: formatted JSON/text response. For `act`: command + result + indication of what changed in sandbox state.
- **agent:response**: the agent's full text, rendered as markdown. This is the "thinking aloud" between tool calls.
- **encounter:result**: resolved/partial/failed badge, score, details. Shows what the sandbox evaluation checked.

## Comparison Mode

Load two traces side by side (e.g., path-1 trial vs path-2 trial). Split screen:

```
┌─────────────────────────────────┬─────────────────────────────────┐
│  Timeline A (path-1)            │  Timeline B (path-2)            │
│  ●──◆──■──○──○──○──◆──■──○──●  │  ●──◆──■──○──○──○──💀           │
├─────────────────────────────────┼─────────────────────────────────┤
│  Agent A Mind                   │  Agent B Mind                   │
│  tools: [inspect, search]       │  tools: [act]                   │
│  knows: 5 facts                 │  knows: 0 facts                 │
├─────────────────────────────────┴─────────────────────────────────┤
│  Divergence Highlight                                             │
│  Step 1: A inspects config → sees drift    B runs script → 404   │
│  Step 2: A inspects logs → confirms        B runs script → 404   │
│  ...                                                              │
└───────────────────────────────────────────────────────────────────┘
```

Timelines align by encounter, not by step index. Same encounter starts at the same horizontal position. Steps within an encounter spread independently. This makes it visible when one agent takes 3 steps and another takes 8 for the same encounter.

**Divergence highlighting**: steps that differ (different tool, different target) are highlighted. Steps that match are dimmed. The visual pattern reveals where paths diverge.

## ChoicePoint Inspector

When a crossroads node is selected, a specialized view:

```
┌──────────────────────────────────────────────────────────────┐
│  Crossroads @ e2 — "search vs model"                         │
│                                                              │
│  ┌─ Path-1 Agent ──────────┐  ┌─ Path-3 Agent ──────────┐   │
│  │ Has: [inspect]           │  │ Has: [search]            │   │
│  │ Chose: search (0.78)     │  │ Chose: inspect (0.92)    │   │
│  │                          │  │                          │   │
│  │ "search gives precedent  │  │ "inspect fills the gap   │   │
│  │  and pattern matching"   │  │  between search and act" │   │
│  │                          │  │                          │   │
│  │ Forward model:           │  │ Forward model:           │   │
│  │ "inspect+search covers   │  │ "search+inspect covers   │   │
│  │  diagnosis"              │  │  grounding"              │   │
│  └──────────────────────────┘  └──────────────────────────┘   │
│                                                              │
│  Same choice point, different developmental context,          │
│  different reasoning. This is the training data.              │
└──────────────────────────────────────────────────────────────┘
```

This is the highest-value visualization — it shows how the same structural decision produces different reasoning depending on what the agent already has. These are the training data pairs from rl-18.

## Data Flow

```
arena JSONL traces (data/arena/{experiment}/{run}.jsonl)
        │
        ├──→ GET /api/metrics/arena?experiment_id=X     (rl-13)
        │         returns: run summaries, path stats, chi-square
        │
        ├──→ GET /api/metrics/arena?experiment_id=X&run_id=Y
        │         returns: full event stream for one run
        │
        └──→ GET /api/metrics/arena?experiment_id=X&compare=run1,run2
                  returns: two event streams, aligned by encounter
```

The API is the only data access layer. Components never read files directly.

## Component Mapping to Tasks

| Task | Component | Key Interaction |
|------|-----------|----------------|
| rl-13 | Arena metrics API | Reads JSONL, returns parsed events + stats |
| rl-14 | RunReplay | Timeline + Agent Mind + Sandbox World + Event Detail |
| rl-15 | PathComparison | Bar charts + chi-square + clustering |
| rl-16 | ChoicePointInspector | Side-by-side crossroads reasoning |

RunReplay (rl-14) is the core — it's the interactive trace debugger as a web component. PathComparison and ChoicePointInspector are specialized views built on top of the same data.

## What Makes This Different from LangSmith/Braintrust/etc.

Existing trace UIs show a call tree: LLM calls, latency, token counts. That's cost debugging. This is **epistemology debugging** — understanding what the agent understood and how that shaped its behavior. The key differences:

1. **Knowledge gap visualization** — fog of war between agent mind and ground truth
2. **Identity tracking** — hash changes visible as state transitions, not just metadata
3. **Developmental context** — the same choice point rendered across agents with different histories
4. **The encounter is the unit** — not the LLM call. You see the problem, the approach, and the outcome as one narrative

## Open Questions

- **Playback speed**: auto-step through events at configurable speed? Useful for demos.
- **Annotation layer**: let the researcher mark events as "interesting" for later analysis?
- **Live mode**: connect to a running experiment and watch traces appear in real time?
- **Export**: screenshot/record a run replay as a shareable artifact (GIF, video, interactive embed)?
