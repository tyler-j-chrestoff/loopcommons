import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { FileSessionWriter } from '@/lib/session/file-session-writer';

describe('Session Linking', () => {
  let tmpDir: string;
  let writer: FileSessionWriter;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-linking-'));
    writer = new FileSessionWriter({ basePath: tmpDir });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('persists parentSessionId in session:start event', async () => {
    const parentId = 'parent-session-01';
    const childId = 'child-session-01';

    await writer.create(childId, { parentSessionId: parentId });
    writer.append(childId, {
      type: 'session:start',
      sessionId: childId,
      parentSessionId: parentId,
      timestamp: Date.now(),
    });
    await writer.finalize(childId);

    // Read back and check the session:start event
    const events: unknown[] = [];
    for await (const event of writer.read(childId)) {
      events.push(event);
    }

    const startEvent = events.find((e: any) => e.type === 'session:start') as any;
    expect(startEvent).toBeDefined();
    expect(startEvent.parentSessionId).toBe(parentId);
  });

  it('includes parentSessionId in session summary on finalize', async () => {
    const parentId = 'parent-session-02';
    const childId = 'child-session-02';

    await writer.create(childId, { parentSessionId: parentId });
    writer.append(childId, {
      type: 'session:start',
      sessionId: childId,
      parentSessionId: parentId,
      timestamp: Date.now(),
    });
    await writer.finalize(childId);

    // The summary is in the session:complete event (last event)
    const events: unknown[] = [];
    for await (const event of writer.read(childId)) {
      events.push(event);
    }

    const completeEvent = events.find((e: any) => e.type === 'session:complete') as any;
    expect(completeEvent).toBeDefined();
    expect(completeEvent.summary.parentSessionId).toBe(parentId);
  });

  it('summary has no parentSessionId when none provided', async () => {
    const sessionId = 'solo-session-01';

    await writer.create(sessionId);
    writer.append(sessionId, {
      type: 'session:start',
      sessionId,
      timestamp: Date.now(),
    });
    await writer.finalize(sessionId);

    const events: unknown[] = [];
    for await (const event of writer.read(sessionId)) {
      events.push(event);
    }

    const completeEvent = events.find((e: any) => e.type === 'session:complete') as any;
    expect(completeEvent.summary.parentSessionId).toBeUndefined();
  });

  it('parentSessionId appears in list results', async () => {
    const parentId = 'list-parent';
    const childId = 'list-child';

    // Create parent session
    await writer.create(parentId);
    writer.append(parentId, {
      type: 'session:start',
      sessionId: parentId,
      timestamp: Date.now(),
    });
    await writer.finalize(parentId);

    // Create child session with parent reference
    await writer.create(childId, { parentSessionId: parentId });
    writer.append(childId, {
      type: 'session:start',
      sessionId: childId,
      parentSessionId: parentId,
      timestamp: Date.now(),
    });
    await writer.finalize(childId);

    const result = await writer.list();
    const childSummary = result.sessions.find(s => s.id === childId);
    expect(childSummary).toBeDefined();
    expect(childSummary!.parentSessionId).toBe(parentId);

    const parentSummary = result.sessions.find(s => s.id === parentId);
    expect(parentSummary).toBeDefined();
    expect(parentSummary!.parentSessionId).toBeUndefined();
  });
});
