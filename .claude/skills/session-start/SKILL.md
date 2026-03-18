---
name: session-start
description: Initialize a new session by reading planning context, identifying the current session, and confirming goals with the user
disable-model-invocation: true
allowed-tools: Read, Glob, Grep
---

# Session Startup

Read the following files in this order:

1. `planning/ROADMAP.md` — identify the **Active milestone** pointer
2. `planning/sessions.yaml` — find the **first entry under `planned:`** (this is your session)
3. The milestone stories referenced by your session's tasks (follow the story file paths)

Then tell the user:

**"Session N: [title]. Goal: [goal]. Phases: [list]."**

Also report:
- What the previous session accomplished (first entry under `completed:` in sessions.yaml)
- Any untracked/modified files in git status that may be leftover from a prior session

Ask if they want to adjust the plan before you begin.

Do NOT skip this. Do NOT start working until the user confirms.
