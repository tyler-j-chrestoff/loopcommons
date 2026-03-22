# Story: Encounter Replay

**Persona**: As a visitor, when I click a cell in the heatmap, I need to see the agent's actual tool calls play out step by step, so I can understand *why* it succeeded or died.

**Status**: done

**Context**: This is where the "aha" happens. The visitor sees an agent call inspect three times, get useful information, then call done without ever using act — because it didn't have act. The tool composition gap becomes viscerally obvious. Step traces (from story step-traces) must be on disk.

**Acceptance criteria**:
- Click a heatmap cell → encounter replay view opens
- Step-by-step timeline: tool name (colored), input, output, duration
- Death moment visually distinct (red marker, cause displayed)
- Encounter context shown: scenario prompt, sandbox state summary
- Score breakdown: what the agent achieved vs what was possible
- Back button returns to heatmap
- Works with trace JSONL from disk (no live execution needed)

## Tasks

```jsonl
{"id":"er-01","title":"GET /api/arena/tournaments/:id/traces/:agentId/:encounterId","type":"implementation","status":"done","description":"Endpoint that reads step trace JSONL from disk and returns parsed StepRecord[] + death + encounterResult. 404 if trace doesn't exist.","estimate":"20min","deps":[],"prereqs":["step-traces story complete"]}
{"id":"er-02","title":"Encounter replay timeline component","type":"implementation","status":"done","description":"Vertical timeline of tool calls. Each step shows: tool name with color badge, input (collapsible JSON), output (collapsible text), duration. Auto-scrolls to death moment if agent died.","estimate":"40min","deps":["er-01"],"prereqs":[]}
{"id":"er-03","title":"Death marker and encounter context","type":"implementation","status":"done","description":"Red death marker at the point of failure with cause and details. Header shows encounter name, scenario prompt summary, agent tools. Score breakdown: achieved vs possible.","estimate":"25min","deps":["er-02"],"prereqs":[]}
{"id":"er-04","title":"Wire replay into heatmap cells","type":"implementation","status":"done","description":"Clicking a heatmap cell navigates to /arena/[tournamentId]/[agentId]/[encounterId] replay view. Back button returns to tournament heatmap. URL is shareable.","estimate":"20min","deps":["er-02","er-03"],"prereqs":[]}
{"id":"er-05","title":"Tests for encounter replay","type":"test","status":"done","description":"TDD: trace endpoint returns correct data, timeline renders steps in order, death marker appears at correct position, empty trace handled gracefully, URL routing works.","estimate":"25min","deps":["er-01","er-02","er-03","er-04"],"prereqs":[]}
```
