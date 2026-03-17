# Prompt for Gemini Review

## Context

We're building a planning system for a software project where AI coding agents (Claude Code with Opus) are the primary executors. The key insight is that the filesystem itself serves as the API — agents navigate the planning hierarchy using `ls`, `cat`, and file edits rather than a database or project management tool.

The project is "Loop Commons" — a personal website with a live LLM-powered conversational agent that exposes full observability of every interaction. It's built with a from-scratch agent loop (`@loopcommons/llm`) and a Next.js frontend (`@loopcommons/web`).

Eventually, the site's own conversational agent will have tool access to this planning system — users chatting with the agent can suggest features, and the agent appends them to the roadmap. The planning system is both internal tooling and future product surface.

## The Planning System

### Taxonomy

```
ROADMAP.md                    The whole product direction (Now / Next / Later / Suggestions)
  └─ milestones/{name}/       Deployable increment with a verification gate
      └─ stories/{name}.md    User-facing intent ("As a [persona]...") with embedded JSONL tasks
```

### Filesystem API

| Intent | Command |
|--------|---------|
| What's the big picture? | `cat planning/ROADMAP.md` |
| What milestones exist? | `ls planning/milestones/` |
| What's in a milestone? | `cat planning/milestones/{name}/milestone.md` |
| What stories are planned? | `ls planning/milestones/{name}/stories/` |
| What's in a story? | `cat planning/milestones/{name}/stories/{name}.md` |

### Agent Workflow

```
1. cat planning/ROADMAP.md                              # orient
2. ls planning/milestones/                               # find active work
3. cat planning/milestones/{active}/milestone.md          # understand the goal
4. ls planning/milestones/{active}/stories/               # find stories
5. cat planning/milestones/{active}/stories/{name}.md     # get context + tasks
6. execute tasks from the JSONL block                     # do the work
7. update task status in the story file                   # track progress
8. when all stories complete → update milestone status    # close the loop
```

### Example Story File

```markdown
# Story: Resume & Bio Tool

> As a **hiring manager** viewing the site, I can ask the agent about Tyler's experience
> and background. The agent uses a `get_resume` tool, producing a multi-round trace with
> tool input/output visible inline and timing shown in the timeline.

## Acceptance Criteria

- Agent has a `get_resume` tool defined with `defineTool()` that returns structured data
- Tool has a clear input schema
- Tool output is concise enough to fit in the ToolCallInline component
- When a user asks "What is Tyler's experience?", the agent calls the tool

## Tasks

\`\`\`jsonl
{"id":"tools-01","story":"resume-tool","description":"Create resume tool with defineTool()","depends_on":[],"status":"pending"}
{"id":"tools-02","story":"resume-tool","description":"Write resume content as typed data","depends_on":["tools-01"],"status":"pending"}
\`\`\`
```

### Example Milestone File

```markdown
# Milestone: Agent Tools & Streaming

**Status**: planned

## Verification Gate

- [ ] Agent has 2+ registered tools
- [ ] Text streams token-by-token
- [ ] Trace inspector shows multi-round data
- [ ] rawResponse is absent from SSE payloads
- [ ] Cost calculation accounts for cached token discount
- [ ] Independent tool calls execute in parallel
```

## What We Want Feedback On

Please provide constructive criticism on this planning system. Specifically:

1. **For AI agent consumption**: Does this structure actually help an AI coding agent make better decisions? What would you change about the information architecture to maximize agent effectiveness? Are stories the right atomic unit, or is something missing between "here's the persona context" and "here's the task"?

2. **For human-AI collaboration**: We arrived at this structure through iteration — we started with hex-prefixed 4-level nesting (ROADMAP → MILESTONE → EPIC → STORY → TASK) and simplified after self-critique. Is the current 3-level structure (ROADMAP → MILESTONE → STORY with embedded tasks) the right balance, or did we cut too much? Is there a level we're missing?

3. **As a product feature**: This planning system will eventually be exposed to end users through the conversational agent (users suggest features, agent writes to the Suggestions section, suggestions get promoted to stories). Does the file format support that lifecycle well? What breaks when you have 50 suggestions, 10 milestones, 100 stories?

4. **Filesystem as API**: Is the "ls/cat as the query interface" metaphor sound, or are there operations an agent would need that the filesystem doesn't naturally support? (e.g., "show me all pending tasks across all stories", "what's blocking task X?")

5. **What's missing?**: What failure modes do you see? What will cause friction at scale? What would a competing approach (e.g., a SQLite database, a single YAML file, a Linear/GitHub Projects integration) do better?

6. **JSONL inside markdown**: Tasks are defined as JSONL code blocks inside story markdown files. This keeps tasks co-located with their context but means parsing requires extracting code blocks. Is this the right tradeoff, or should tasks live in separate files?

Be specific and actionable. We value honest criticism over validation.
