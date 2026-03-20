# Story: CLI Interface Adapter

**Persona**: As Tyler, I want to talk to the agent from my terminal, so I can interact without opening the web UI.

**Status**: planned

**Acceptance criteria**:
- Interactive REPL (`packages/cli` or `scripts/chat-cli.ts`)
- Uses `createAgentCore()`, local memory path, JSONL session output
- `--admin` flag for blog write access
- Pipeline consolidates CLI sessions alongside web sessions
- Red-team: CLI can't escalate beyond auth level

## Tasks

```jsonl
{"id":"mi-06","title":"Create CLI REPL entrypoint","type":"implementation","status":"planned","description":"Create interactive stdin/stdout REPL (packages/cli or scripts/chat-cli.ts). Reads input, calls createAgentCore().invoke(), prints response. Maintains conversation history in-memory.","estimate":"45min","deps":["mi-03"],"prereqs":[]}
{"id":"mi-07","title":"Wire CLI to createAgentCore()","type":"implementation","status":"planned","description":"CLI creates its own ToolPackage instances (local memory path, blog tools if admin). Passes interfaceId: 'cli' in AgentInvocation.","estimate":"30min","deps":["mi-06"],"prereqs":[]}
{"id":"mi-08","title":"Add --admin flag to CLI","type":"implementation","status":"planned","description":"CLI accepts --admin flag. When set, identity.isAdmin = true and blog-writer tools are available. Without flag, read-only.","estimate":"20min","deps":["mi-07"],"prereqs":[]}
{"id":"mi-09","title":"CLI session persistence","type":"implementation","status":"planned","description":"CLI writes JSONL session files to local data/sessions/ directory. Same format as web sessions. Pipeline consolidation picks them up.","estimate":"30min","deps":["mi-07"],"prereqs":[]}
{"id":"mi-10","title":"Pipeline consolidation for CLI sessions","type":"implementation","status":"planned","description":"Verify Dagster consolidation asset picks up CLI session files alongside web sessions. Add interfaceId column to Parquet schema if needed.","estimate":"30min","deps":["mi-09"],"prereqs":[]}
{"id":"mi-11","title":"Red-team: CLI auth escalation","type":"test","status":"planned","description":"Write tests verifying CLI without --admin cannot access blog write tools. Verify amygdala still runs. Verify no path to escalate.","estimate":"30min","deps":["mi-08"],"prereqs":[]}
```
