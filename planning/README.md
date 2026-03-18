# Planning — Filesystem API

This directory is a structured planning system designed to be navigated by both humans and AI agents. The filesystem *is* the API.

## Quick Start (Agent)

```bash
cat planning/ROADMAP.md                    # find the active milestone pointer
cat planning/milestones/{active}/milestone.md   # read goal + verification gate
ls planning/milestones/{active}/stories/         # list stories
cat planning/milestones/{active}/stories/{name}.md  # get persona context + tasks
```

## Operations

| Intent | Command |
|--------|---------|
| Where do I start? | `cat planning/ROADMAP.md` — look for **Active milestone** |
| What milestones exist? | `ls planning/milestones/` |
| What's in a milestone? | `cat planning/milestones/{name}/milestone.md` |
| What stories are planned? | `ls planning/milestones/{name}/stories/` |
| What's in a story? | `cat planning/milestones/{name}/stories/{name}.md` |
| What's been suggested? | `ls planning/suggestions/` |
| What sessions are planned/done? | `cat planning/sessions.yaml` |

## Taxonomy

```
sessions.yaml                      Session log + forward plan (1 entry per conversation)
ROADMAP.md                         Product direction + active milestone pointer
  └─ milestones/{name}/            Deployable increment with a verification gate
      ├─ milestone.md              Summary, status, verification checklist
      ├─ stories/                  Active work
      │   └─ {name}.md            "As a [persona]..." + acceptance criteria + tasks
      └─ archive/                  Completed stories (keep active dirs sparse)
  └─ suggestions/                  Individual feature suggestion files
  └─ reviews/                      External feedback (Gemini, user testing, etc.)
```

### Definitions

- **Milestone** = a deployable increment. Status: `planned` | `active` | `completed`. Has a verification gate — a checklist of conditions that must all pass.
- **Story** = the atomic unit of planning. Framed as "As a [persona]..." with acceptance criteria and a `## Tasks` section containing JSONL task definitions. A story is self-contained — one read gives an agent everything it needs.
- **Task** = a single unit of work executable by one agent. Defined as JSONL inside a story. Fields: `id`, `story`, `description`, `depends_on`, `requires`, `status`.
- **Suggestion** = an individual file in `suggestions/` proposed by a user or the conversational agent. Promoted to a story in a milestone when ready. One file per suggestion avoids write conflicts.

## Conventions

- Directory and file names are lowercase-kebab-case
- `milestone.md` is always the root doc of a milestone folder
- Stories are self-contained — an agent reads one file and has everything it needs
- Completed stories move to `milestones/{name}/archive/` to keep active dirs sparse
- Completed milestones stay in the tree (status: `completed`) as a record
- ROADMAP.md always has an **Active milestone** pointer at the top

## Agent Workflow

```
1. cat planning/ROADMAP.md                              # find active milestone
2. cat planning/milestones/{active}/milestone.md          # understand the goal
3. ls planning/milestones/{active}/stories/               # find stories
4. cat planning/milestones/{active}/stories/{name}.md     # get context + tasks
5. execute tasks from the JSONL block                     # do the work
6. update task status in the story file                   # track progress
7. when all stories done → move to archive/               # keep dirs clean
8. update milestone.md status + verification checklist     # close the loop
```

## Design Decisions

This system was reviewed by multiple AI models (Claude, Gemini) and iterated through several designs. Key decisions:

- **3 levels, not 5**: We cut EPIC as a separate layer. Stories already group related tasks. Adding epics fragmented context across too many files.
- **Stories as atomic units**: An agent reads one file and gets persona ("As a hiring manager..."), acceptance criteria, and executable tasks. No cross-file assembly required.
- **Sharded suggestions**: Individual files in `suggestions/` instead of one list in ROADMAP.md. Prevents write conflicts when the web agent and coding agent operate concurrently.
- **Active milestone pointer**: ROADMAP.md explicitly names the active milestone so agents don't guess from directory listings.
- **Archive, don't delete**: Completed stories move to `archive/` rather than being deleted. Preserves history without cluttering active work.
- **JSONL in markdown**: Tasks are co-located with their story context. Tradeoff: parsing requires extracting code blocks. If this proves fragile during agent execution, we'll add a `bin/update-task` script to abstract mutations.
