# Story: Resume & Bio Tool

> As a **hiring manager** viewing the site, I can ask the agent about Tyler's experience and background. The agent uses a `get_resume` tool, producing a multi-round trace with tool input/output visible inline and timing shown in the timeline.

## Acceptance Criteria

- Agent has a `get_resume` tool defined with `defineTool()` that returns structured data about Tyler's experience, skills, and background
- Tool has a clear input schema (e.g., `{ section?: "experience" | "skills" | "education" | "all" }`)
- Tool output is concise enough to fit in the ToolCallInline component without excessive scrolling
- When a user asks "What is Tyler's experience?", the agent calls the tool and synthesizes a response

## Tasks

```jsonl
{"id":"tools-01","story":"resume-tool","description":"Create packages/web/src/tools/resume.ts with defineTool() — returns structured resume data by section","depends_on":[],"status":"done"}
{"id":"tools-02","story":"resume-tool","description":"Write resume content as typed data (not a wall of text) — experience entries, skills list, education. Keep it real and current.","depends_on":["tools-01"],"status":"done"}
```
