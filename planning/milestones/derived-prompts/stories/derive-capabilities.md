# Story: Derive Capabilities from Tool Metadata

**Persona**: As the agent architect, I need system prompts that automatically reflect actual tool capabilities, so prompts never drift from tool reality.

**Status**: planned

**Acceptance criteria**:
- `deriveCapabilities()` and `deriveBoundaries()` pure functions
- SubagentConfig.systemPrompt trimmed to domain knowledge only
- `buildSystemPrompt()` assembles hybrid prompts
- Prompt equivalence tests: derived prompts contain all capability info
- Zero regression across test suite

## Tasks

```jsonl
{"id":"dp-01","title":"Implement deriveCapabilities() pure function","type":"implementation","status":"planned","description":"Create deriveCapabilities(tools: ToolDefinition[]): string in packages/llm/src/tool/. Generates a markdown capability list from tool names, descriptions, and ToolPackage metadata (intent, sideEffects). TDD.","estimate":"45min","deps":[],"prereqs":["tool-packages milestone complete"]}
{"id":"dp-02","title":"Implement deriveBoundaries() pure function","type":"implementation","status":"planned","description":"Create deriveBoundaries(allowlist: string[], allToolNames: string[]): string. Generates 'you cannot...' section from excluded tools. TDD.","estimate":"30min","deps":[],"prereqs":["tool-packages milestone complete"]}
{"id":"dp-03","title":"Implement buildSystemPrompt() assembler","type":"implementation","status":"planned","description":"Create buildSystemPrompt({ domainKnowledge, tools, allowlist, allToolNames, annotations? }): string. Assembles base + authored domain knowledge + derived capabilities + derived boundaries. TDD.","estimate":"45min","deps":["dp-01","dp-02"],"prereqs":[]}
{"id":"dp-04","title":"Trim SubagentConfig.systemPrompt to domain knowledge","type":"implementation","status":"planned","description":"Refactor subagent registry configs: remove capability descriptions from systemPrompt (now derived). Keep framing, personality, constraints. Security subagent stays 100% authored.","estimate":"60min","deps":["dp-03"],"prereqs":[]}
{"id":"dp-05","title":"Prompt equivalence tests","type":"test","status":"planned","description":"Write tests proving derived prompts contain all capability info that was previously hand-written. Snapshot comparison against current prompts. Verify no information loss.","estimate":"45min","deps":["dp-04"],"prereqs":[]}
```
