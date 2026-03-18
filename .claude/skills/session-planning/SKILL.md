---
name: session-planning
description: Collaborative planning session — brainstorm direction, discuss ideas, research feasibility, and output planned sessions in sessions.yaml
disable-model-invocation: true
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Agent, WebSearch, WebFetch
---

# Session Planning

This is a creative brainstorming and planning conversation. The goal is to figure out what to build next and why — then turn that into concrete planned sessions.

## 1. Load context

Read these files to understand where we are:
- `planning/ROADMAP.md` — active milestone, what's done, what's next, what's later
- `planning/sessions.yaml` — currently planned sessions + recent retros
- `planning/suggestions/*.md` — all filed suggestions (these are raw ideas waiting to be shaped)
- The active milestone's stories (to understand what's in-flight)

Summarize the current state briefly: what just shipped, what's planned, what's in the suggestion box.

## 2. Open discussion

This is a dialectic, not a waterfall. The user has ideas, vibes, half-formed thoughts, and strong opinions. Your job is to:

- **Listen and riff** — build on their ideas, don't just validate them
- **Challenge constructively** — if something seems off, say why and offer alternatives
- **Research when needed** — use web search to check feasibility, find prior art, verify claims (Rule #1)
- **Connect dots** — relate new ideas to existing architecture, prior decisions, theoretical foundations
- **Stay grounded** — exciting ideas still need to become tasks someone can execute

Don't rush to output. The conversation IS the value. Let it breathe.

## 3. Shape sessions

When the discussion converges on direction, help shape it into:

- **Milestones** (if new work areas emerge) — create in `planning/milestones/`
- **Stories** (with JSONL tasks) — write them with the right persona and acceptance criteria
- **Planned sessions** in `sessions.yaml` — with id, title, milestone, goal, phases, tasks, strategy
- **Suggestions** (for ideas not ready to plan) — file in `planning/suggestions/`

Update `ROADMAP.md` if the active milestone or Next/Later ordering changes.

## 4. Don't forget

- Stories involving security, best practices, or library selection must lead with a research task
- Tasks should be JSONL with dependencies and external prerequisites declared
- Apply YAGNI/KISS — don't over-plan what might change after one session of learning
- The user's intuition about priority matters more than any framework
