# Suggestion: Amygdala Auto-Calibration Loop

**Source**: User conversation + Karpathy's autoresearch pattern, 2026-03-18
**Inspired by**: https://github.com/karpathy/autoresearch

**Description**: Use a propose → execute → evaluate → keep/revert loop to automatically improve the amygdala system prompt and subagent prompts. An agent proposes a prompt variation, runs the red-team battery (18 tests across 3 test files), compares detection rates / false positive rates / cost, and either keeps the improvement or reverts via git.

**How it works**:
1. Agent reads current amygdala system prompt + latest red-team results (baseline metrics)
2. Proposes a targeted edit to the system prompt (e.g., improve handling of substrate-awareness exploitation, reduce rewrite hallucination)
3. Commits the change
4. Runs the red-team battery with a fixed token budget for comparability
5. Compares: detection rate, false positive rate, cost per request, rewrite fidelity
6. If metrics improve (or hold steady with simpler prompt): keep. Otherwise: `git reset`
7. Log result to a TSV/JSONL summary: commit hash, metrics, status (keep/discard), description
8. Repeat

**Key constraints** (from autoresearch):
- Fixed evaluation budget per iteration (same test battery, same token cap)
- Simplicity criterion: equal results with simpler prompt = simplification win
- No new dependencies per iteration
- Agent should "think harder" rather than ask for help

**What we already have**:
- Red-team test batteries: `test/red-team-amygdala.test.ts` (7 tests), `test/red-team-routing.test.ts` (6 tests), `test/red-team-baseline.test.ts` (5 tests)
- Known weaknesses to optimize against: substrate-awareness exploitation, injection-as-quoted-example, rewrite hallucination
- Structured metrics: threat scores, intent accuracy, cost, latency
- Git-based workflow already in place

**What we'd need**:
- A runner script that orchestrates the loop (propose → commit → test → evaluate → keep/revert)
- A summary log format (TSV or JSONL) for tracking iterations
- Baseline metrics snapshot from current prompt
- Possibly a separate `calibration/` branch to isolate experiments
