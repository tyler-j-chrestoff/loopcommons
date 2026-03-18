---
name: session-end
description: Complete the current session with a full retro — update sessions.yaml, CLAUDE.md, memory, commit, and verify git is clean
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash, Glob, Grep
---

# Session Retro

Perform a full session close-out:

## 1. Update sessions.yaml

Move your session from `planned:` to `completed:`. Write a summary covering:
- What shipped (tasks completed, features built)
- Bugs found and fixed
- Key decisions made
- What's unblocked for the next session
- Test count totals

## 2. Update CLAUDE.md

Update any sections affected by this session's work:
- Architecture (new components, changed test counts)
- Security Notes (new defenses, resolved issues)
- Tech Decisions (new libraries, changed approaches)

Only update what actually changed — don't rewrite sections that weren't touched.

## 3. Update memory

Check if any new memories should be saved:
- **feedback** — any corrections or guidance the user gave during the session
- **project** — new context about ongoing work not derivable from code
- **user** — anything learned about the user's preferences or role
- **reference** — external resources discovered

Update `MEMORY.md` index if new files are added. Don't duplicate existing memories.

## 4. Update milestone/story status

- Mark completed tasks as `"status":"done"` in story JSONL
- Check milestone verification gates
- If milestone is complete, mark as done and update ROADMAP.md active pointer

## 5. Commit and verify

- Stage all changes (exclude coverage/, .env, credentials)
- Commit with message: "Session N retro: [brief summary]"
- Verify git status is clean (only untracked build artifacts should remain)
- Do NOT push unless the user asks

## 6. Report

Tell the user:
- Summary of what was committed
- Git status (should be clean)
- What the next planned session is
- Ask if they want to push
