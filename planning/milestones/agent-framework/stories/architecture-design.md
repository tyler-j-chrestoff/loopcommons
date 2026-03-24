# Story: Architecture Design — Brain-Inspired Multi-Channel Agent

**Persona**: As the founder of a non-profit deploying AI agents to underserved communities, I need a rigorous architecture design that defines the contracts between subsystems before building channel adapters, so that the system is coherent, auditable, and extensible from day one.

**Status**: planned

**Context**: Session 56.5 strategic pivot. Loop Commons is becoming a multi-channel agent framework grounded in brain-inspired subsystems and thermodynamic economics. VISION.md defines the mission. This story produces the design doc that all implementation sessions build from.

**Acceptance criteria**:
- Design doc covers all subsystems: router, guardian (amygdala), orchestrator, consolidator, conflict-monitor, substrate-monitor, reflector
- Each subsystem has a TypeScript interface (contract) with clear inputs/outputs
- Message format is defined — channel-agnostic canonical representation
- Memory model is defined — how provenance tracks channels, how consolidation works cross-channel
- User identity model is defined — same person across channels = same user
- Thermodynamic ledger design — TigerBeetle data model (accounts, transfers, ledgers), staking protocol, three scales (intra-agent, inter-agent, organizational)
- Sandbox model is defined — what isolation means, what substrate awareness gives the agent
- Migration path from current architecture — what stays, what moves, what's new
- No code in this session — contracts and prose only

## Tasks

```jsonl
{"id":"af-01","title":"Research: Claude Agent SDK vs Vercel AI SDK vs raw Anthropic API","type":"research","status":"planned","description":"Compare agent framework approaches. Confirm Vercel AI SDK is the right base (multi-provider, TypeScript, existing integration). Check MCP spec for tool interop. Document decision.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"af-01b","title":"Research: NanoClaw, OpenClaw, and agent framework landscape","type":"research","status":"planned","description":"Deep dive into NanoClaw (architecture, channel adapters, container isolation, SQLite state, how it uses Claude Agent SDK). Review OpenClaw if accessible. Survey other lightweight agent frameworks. Identify patterns to adopt, mistakes to avoid, and gaps our brain-inspired approach fills. Key questions: how do they handle multi-channel identity? How do they handle memory? What's their security model? How extensible are they?","estimate":"30min","deps":[],"prereqs":[]}
{"id":"af-02","title":"Research: TigerBeetle for non-financial accounting","type":"research","status":"planned","description":"Verify TigerBeetle Node.js client exists and is production-ready. Confirm data model fits (accounts=subsystems, transfers=energy, ledgers=isolation). Check if two-phase transfers work for staking. Document constraints and alternatives.","estimate":"20min","deps":[],"prereqs":[]}
{"id":"af-03","title":"Define canonical message format","type":"design","status":"planned","description":"Design the internal message type that all channel adapters produce. Must include: channel origin, user identity, content, metadata (thread ID, reply-to, attachments). Map to/from existing Vercel AI SDK message types. Write TypeScript interface.","estimate":"15min","deps":["af-01"],"prereqs":[]}
{"id":"af-04","title":"Define subsystem contracts","type":"design","status":"planned","description":"Write TypeScript interfaces for each brain-inspired subsystem: Router (channel→processing→channel), Guardian (amygdala — threat/alignment check, veto power), Orchestrator (tool/subagent selection), Consolidator (cross-channel memory formation), ConflictMonitor (contradiction detection), SubstrateMonitor (sandbox awareness, resource tracking), Reflector (between-session identity maintenance). Each gets: input type, output type, side effects, energy cost model.","estimate":"40min","deps":["af-01"],"prereqs":[]}
{"id":"af-05","title":"Define thermodynamic ledger model","type":"design","status":"planned","description":"Map TigerBeetle primitives to agent economics. Define: account schema (one per subsystem + agent-level + org-level), transfer types (stake, reward, slash, delegate, fund), ledger isolation (intra-agent vs inter-agent vs organizational). Define staking protocol: bid format, two-phase lifecycle, outcome measurement, reward/slash ratios. Define metabolic baseline and death conditions.","estimate":"30min","deps":["af-02"],"prereqs":[]}
{"id":"af-06","title":"Define user identity and session model","type":"design","status":"planned","description":"How does the agent know the same person across Discord and WhatsApp? Options: explicit linking, phone number, OAuth. Define session boundaries — per-channel-thread? per-user-day? How does memory provenance track channel origin? Write the UserIdentity type and session lifecycle.","estimate":"20min","deps":["af-03"],"prereqs":[]}
{"id":"af-07","title":"Define sandbox and substrate awareness model","type":"design","status":"planned","description":"What container isolation means for this agent. What the agent knows about its sandbox (resource limits, capabilities, channel constraints). How SubstrateMonitor exposes this to the guardian/orchestrator. How this differs from NanoClaw's container-only approach.","estimate":"20min","deps":["af-04"],"prereqs":[]}
{"id":"af-08","title":"Migration map from current architecture","type":"design","status":"planned","description":"Map every existing component to its place in the new architecture. createAgentCore→orchestrator, amygdala→guardian, MemoryContract→consolidator+conflict-monitor, subagents→tool specialists, route.ts→router. Identify what stays as-is, what gets a new interface wrapper, what's genuinely new. This is the bridge from 56 sessions of work to the new frame.","estimate":"20min","deps":["af-04"],"prereqs":[]}
{"id":"af-09","title":"Write the design doc","type":"design","status":"planned","description":"Synthesize af-01 through af-08 into a single design doc at planning/milestones/agent-framework/designs/brain-architecture.md. Include: system diagram, all interfaces, data model, migration path, open questions. This is the blueprint for all implementation sessions.","estimate":"30min","deps":["af-03","af-04","af-05","af-06","af-07","af-08"],"prereqs":[]}
```
