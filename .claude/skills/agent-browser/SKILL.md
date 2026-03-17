---
name: browser
description: End-to-end verify frontend functionality using agent-browser. Use when the user asks to test, verify, or check a web page, UI component, or frontend feature in a real browser.
argument-hint: [url-or-description]
allowed-tools: Bash, Read, Glob
---

```yaml
setup:
  install: npm list -g agent-browser || npm install -g agent-browser
  chrome: agent-browser install 2>/dev/null || true
  check: agent-browser --version

workflow:
  sequence: [navigate, wait, snapshot, interact, verify, close]
  rule: always follow this sequence; never skip snapshot before interact or close at end

navigate:
  command: agent-browser open {url}
  input: $ARGUMENTS if URL, else infer from project context (e.g. http://localhost:3000)
  follow-with: agent-browser wait --load networkidle

snapshot:
  command: agent-browser snapshot -i
  returns: accessibility tree with refs (@e1, @e2, ...)
  use-refs-for: all subsequent interactions
  invalidated-by: [page navigation, form submission, dynamic content load]
  rule: always re-snapshot after any of the above

interact:
  fill: agent-browser fill @eN "text"
  click: agent-browser click @eN
  select: agent-browser select @eN "value"
  check: agent-browser check @eN
  keyboard: agent-browser keyboard type "text"

wait:
  for-text: agent-browser wait --text "expected"
  for-network: agent-browser wait --load networkidle
  for-element: agent-browser wait @selector
  for-url: agent-browser wait --url "pattern"
  for-js: agent-browser wait --fn "expression"
  rule: always wait before verifying; never assume content loaded after interaction
  timeout: 25s default; override with AGENT_BROWSER_DEFAULT_TIMEOUT

verify:
  text: agent-browser get text {css-selector}
  url: agent-browser get url
  title: agent-browser get title
  value: agent-browser get value {css-selector}
  screenshot: agent-browser screenshot [--full]
  report: state what was tested, what was expected, what actually happened

close:
  command: agent-browser close
  rule: always close explicitly to prevent daemon leaks

sessions:
  isolate: agent-browser --session {name} {command}
  use-when: concurrent tests
  rule: always close named sessions

chaining:
  use-&&: when intermediate output not needed
  example: agent-browser open URL && agent-browser wait --load networkidle && agent-browser screenshot

diff:
  snapshot: agent-browser diff snapshot --baseline {file}
  screenshot: agent-browser diff screenshot --baseline {file} [-t threshold] [-o output]
  url: agent-browser diff url {url1} {url2} [--screenshot]
  baseline-save:
    snapshot: agent-browser snapshot -i > baseline.txt
    screenshot: agent-browser screenshot --full -o baseline.png

chat-ui-verification:
  steps:
    - open app, wait for load
    - snapshot to find chat input and send button
    - fill input with test message
    - click send
    - wait for LLM response text
    - verify response content, trace data, cost display
    - screenshot for visual record
    - close session

errors:
  not-found: install agent-browser
  stale-ref: re-snapshot and retry
  timeout: screenshot current state for debugging, then report failure
```
