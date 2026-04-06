# Story: Discord Adapter

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §2.4, §4 — channel three

## Why

SMS is channel two. Discord is channel three. Discord differs fundamentally from web and SMS: it requires a persistent WebSocket connection (gateway) rather than HTTP request-response. The ChannelAdapter normalize/format pattern works for message transformation, but the harness is new.

## Research Summary (S62)

- **discord.js v14** (14.26.x): stable, no v15 announced.
- **MESSAGE_CONTENT** is a privileged intent. Under 100 servers: toggle on in Developer Portal, no approval needed. At 75+ servers: verification required.
- **Gateway architecture**: persistent WebSocket, not HTTP. Bot process must be long-running. Cannot run inside Next.js route handler or serverless function.
- **Railway deployment**: separate worker service (no exposed port). Fits within $5/mo for low traffic, but two services sharing credits is tight. Pro plan ($20/mo) is fallback.
- **DiscordAdapter shape**: `normalize(raw)` takes discord.js Message object, `format(response)` returns markdown string truncated to 2000 chars. The new piece is the gateway harness — analogous to route.ts for web or webhook/route.ts for SMS, but long-running.

## Acceptance Criteria

- DiscordAdapter passes ChannelAdapter contract (normalize/format)
- Gateway harness connects to Discord, receives messages, routes through Router, replies
- Discord user identity links to cross-channel identity via existing explicit-link protocol
- Bot deployed as Railway worker service
- Red-team: bot ignores own messages, handles empty content, respects rate limits, no token leakage

## Tasks

```jsonl
{"id":"dc-01","title":"Bot registration + Developer Portal setup","description":"Register Discord application, create bot user, enable MESSAGE_CONTENT privileged intent, generate invite URL with minimum permissions (Send Messages, Read Message History, View Channels). Store token in env.","deps":[],"prereqs":["Discord account with Developer Portal access","Test Discord guild"]}
{"id":"dc-02","title":"DiscordAdapter normalize/format","description":"TDD: createDiscordAdapter() implementing ChannelAdapter. normalize() accepts discord.js Message-shaped input, produces ChannelMessage with user/thread/content/attachments. format() truncates to 2000 chars, returns markdown string. Unit tests with mock Message objects.","deps":["dc-01"],"prereqs":[]}
{"id":"dc-03","title":"Discord gateway harness","description":"TDD: createDiscordGateway() — manages Client lifecycle (login, SIGTERM shutdown), listens for messageCreate, filters bot messages, determines response trigger (DM or @mention), calls Router.process() with DiscordAdapter, sends formatted response. Typing indicator while processing.","deps":["dc-02"],"prereqs":[]}
{"id":"dc-04","title":"Railway worker service deployment","description":"Add discord-bot entry point. Configure railway.json for worker service (no port). Add DISCORD_BOT_TOKEN to Railway env. Verify bot connects and responds in test guild. Graceful shutdown handling.","deps":["dc-03"],"prereqs":["Railway Pro plan or budget headroom"]}
{"id":"dc-05","title":"Identity + admin mapping","description":"TDD: Discord user ID to UserIdentity mapping. Admin detection via configurable Discord user ID allowlist. Wire IdentityStore so Discord users can link to cross-channel identity via existing explicit-link protocol.","deps":["dc-02"],"prereqs":[]}
{"id":"dc-06","title":"Red-team + edge cases","description":"Bot ignores its own messages, handles empty content (attachment-only), respects rate limiting, handles Discord API errors (permission denied, rate limited), reconnection after gateway disconnect, message over 2000 chars splits correctly. No token/secret leakage in responses.","deps":["dc-03","dc-05"],"prereqs":[]}
```
