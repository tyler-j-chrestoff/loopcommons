# Story: Project Details Tool

> As a **researcher interested in agentic engineering**, I can ask the agent about how Loop Commons is built. The agent uses a `get_project` tool to retrieve architecture details, producing a trace that demonstrates the system observing itself.

## Acceptance Criteria

- Agent has a `get_project` tool that returns details about the Loop Commons architecture, tech stack, and design decisions
- Input schema allows querying by topic (e.g., `{ topic: "architecture" | "trace-system" | "tech-stack" | "agent-loop" }`)
- The meta-quality of "the agent explaining its own trace system while producing a trace" is preserved — this is the project's signature moment

## Tasks

```jsonl
{"id":"tools-03","story":"project-tool","description":"Create packages/web/src/tools/project.ts with defineTool() — returns architecture and design decision data by topic","depends_on":[],"status":"done"}
```
