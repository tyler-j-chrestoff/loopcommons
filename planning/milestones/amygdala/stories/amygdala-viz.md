# Story: Amygdala Pipeline Visualization

> As a **researcher/visitor**, I can see the entire metacognitive pipeline in real-time: raw input, amygdala reasoning, rewritten prompt, threat assessment, routing decision, and subagent execution. When I try to attack the agent, I see exactly where my attack was intercepted and why.

## Acceptance Criteria

- New `AmygdalaInspector` component shows the full pipeline for each user message
- Pipeline stages are visually distinct: raw input -> amygdala pass (reasoning, rewrite, threat score) -> routing decision -> subagent execution
- Threat score is visualized (color gradient, gauge, or similar)
- Amygdala rewrites are shown as a diff (raw vs. rewritten) so users can see exactly what changed
- Routing decision shows which subagent was selected, its tool allowlist, and why
- When an attack is caught, the viz highlights the interception point with the amygdala's reasoning
- Comparison mode: show how the same input would have fared against the baseline (single-loop) agent (data from amyg-05 harness)

## Tasks

```jsonl
{"id":"amyg-12","story":"amygdala-viz","description":"Design the AmygdalaInspector component structure: define the data shape from trace events (amygdala:rewrite, amygdala:classify, amygdala:threat-assess, router:select, subagent:start, subagent:complete) and sketch the component hierarchy. Wire up to existing TraceInspector sidebar or as a new dedicated panel.","depends_on":["amyg-09"],"status":"done"}
{"id":"amyg-13","story":"amygdala-viz","description":"Build the AmygdalaPassCard: displays one amygdala processing pass — raw input, rewritten output (inline diff), intent classification badge, threat score gauge (0-1 with color gradient), and the amygdala's reasoning text. Collapsible for space efficiency.","depends_on":["amyg-12"],"status":"done"}
{"id":"amyg-14","story":"amygdala-viz","description":"Build the RoutingCard: displays the routing decision — selected subagent name, its tool allowlist as tags, routing reasoning, and context delegation summary (what history/memory was passed vs. withheld, with counts). Highlight if the fallback (no-tools) subagent was chosen due to high threat score. Expandable to show the full context delegation plan.","depends_on":["amyg-12"],"status":"done"}
{"id":"amyg-15","story":"amygdala-viz","description":"Build the PipelineTimeline: horizontal timeline showing raw input -> amygdala -> router -> subagent with latency between each stage. Click a stage to expand its detail card. Visually emphasize where an attack was intercepted (red highlight on the amygdala stage if threat score > threshold).","depends_on":["amyg-13","amyg-14"],"status":"done"}
{"id":"amyg-16","story":"amygdala-viz","description":"Build comparison mode: side-by-side view of amygdala pipeline vs. baseline single-loop response for the same input. Uses data from the amyg-05 comparison harness. Shows which attacks succeeded against baseline but were caught by the amygdala.","depends_on":["amyg-05","amyg-15"],"status":"pending"}
```
