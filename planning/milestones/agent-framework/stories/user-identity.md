# Story: User Identity + SMS Adapter

**Milestone:** agent-framework (Phase C)
**Traces to:** brain-architecture.md §4 — Cross-channel identity

## Why

The same person across web chat and SMS must be the same user. UserIdentity links channel-specific IDs into a unified identity. The SMS adapter (Twilio) is channel two — the channel that actually reaches the communities VISION.md is about. 89% of homeless veterans have phones; 71% text. SMS is the universal baseline.

## Acceptance Criteria

- UserIdentity/ChannelLink types match §4 contract
- In-memory identity store with explicit-link protocol
- TwilioAdapter implements ChannelAdapter for inbound/outbound SMS
- Webhook handler in Next.js for Twilio callbacks
- Identity linking tested: web user links SMS number, memories shared

## Tasks

```jsonl
{"id":"ui-01","title":"Research: Twilio SMS SDK + webhook patterns","description":"Research task. Twilio Node.js SDK, webhook signature validation, inbound/outbound message flow, number provisioning, cost model. Verify against current (2026) docs.","deps":[],"prereqs":["Twilio account created","Twilio phone number provisioned"]}
{"id":"ui-02","title":"UserIdentity types","description":"Define UserIdentity, ChannelLink, LinkMethod types matching §4. Include linking protocol types: LinkRequest, LinkVerification.","deps":[],"prereqs":[]}
{"id":"ui-03","title":"Identity store","description":"In-memory identity store. Create on first contact, link via explicit-link protocol (verification code), lookup by channel user ID. Interface-first so file-backed impl can swap in later.","deps":["ui-02"],"prereqs":[]}
{"id":"ui-04","title":"TwilioAdapter","description":"Implement TwilioAdapter: ChannelAdapter for type 'sms'. normalize() parses Twilio webhook payload to ChannelMessage. format() returns TwiML response. Webhook signature validation.","deps":["ui-01"],"prereqs":["TWILIO_ACCOUNT_SID env var","TWILIO_AUTH_TOKEN env var","TWILIO_PHONE_NUMBER env var"]}
{"id":"ui-05","title":"SMS webhook route","description":"Next.js API route for Twilio webhooks. Receives inbound SMS, delegates to Router.process() via TwilioAdapter, returns TwiML. Handles Twilio signature validation middleware.","deps":["ui-04"],"prereqs":[]}
{"id":"ui-06","title":"Identity linking integration","description":"End-to-end: web user initiates link, receives verification code via SMS, enters code on web. Identity store links both channel IDs. Memories become shared via Consolidator.","deps":["ui-03","ui-05"],"prereqs":[]}
{"id":"ui-07","title":"Red-team tests","description":"Spoofed webhook signatures rejected, invalid phone numbers handled, identity link with wrong verification code fails, rapid link attempts rate-limited.","deps":["ui-06"],"prereqs":[]}
```
