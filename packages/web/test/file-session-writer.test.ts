import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FileSessionWriter } from '../src/lib/session/file-session-writer';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { SessionEvent } from '../src/lib/session-writer';

let tmpDir: string;
let writer: FileSessionWriter;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'session-test-'));
  writer = new FileSessionWriter({ basePath: tmpDir });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('FileSessionWriter', () => {
  it('creates session directory and tmp file on create()', async () => {
    await writer.create('test-session-1');

    // Should have a date directory
    const dateDirs = fs.readdirSync(tmpDir);
    expect(dateDirs.length).toBe(1);
    expect(dateDirs[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    // Should have a .tmp.jsonl file
    const files = fs.readdirSync(path.join(tmpDir, dateDirs[0]));
    expect(files).toContain('test-session-1.tmp.jsonl');
  });

  it('appends events as JSONL lines', async () => {
    await writer.create('test-session-2');

    const event1: SessionEvent = {
      type: 'round:start',
      round: 0,
      timestamp: Date.now(),
    };
    const event2: SessionEvent = {
      type: 'text-delta',
      delta: 'hello',
      timestamp: Date.now(),
    };

    writer.append('test-session-2', event1);
    writer.append('test-session-2', event2);

    // Read the tmp file directly
    const dateDirs = fs.readdirSync(tmpDir);
    const tmpFile = path.join(tmpDir, dateDirs[0], 'test-session-2.tmp.jsonl');
    const content = fs.readFileSync(tmpFile, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).type).toBe('round:start');
    expect(JSON.parse(lines[1]).type).toBe('text-delta');
  });

  it('finalize renames tmp to final and adds session:complete', async () => {
    await writer.create('test-session-3');

    writer.append('test-session-3', {
      type: 'round:start',
      round: 0,
      timestamp: Date.now(),
    });

    await writer.finalize('test-session-3');

    const dateDirs = fs.readdirSync(tmpDir);
    const dir = path.join(tmpDir, dateDirs[0]);
    const files = fs.readdirSync(dir);

    // Should have .jsonl (finalized), no .tmp.jsonl
    expect(files).toContain('test-session-3.jsonl');
    expect(files).not.toContain('test-session-3.tmp.jsonl');

    // Last line should be session:complete
    const content = fs.readFileSync(path.join(dir, 'test-session-3.jsonl'), 'utf-8');
    const lines = content.trim().split('\n');
    const lastEvent = JSON.parse(lines[lines.length - 1]);
    expect(lastEvent.type).toBe('session:complete');
    expect(lastEvent.summary).toBeDefined();
    expect(lastEvent.summary.id).toBe('test-session-3');
    expect(lastEvent.summary.eventCount).toBe(2); // 1 appended + 1 session:complete
  });

  it('read() yields all events in order', async () => {
    await writer.create('test-session-4');

    const events: SessionEvent[] = [
      { type: 'round:start', round: 0, timestamp: 1000 },
      { type: 'text-delta', delta: 'hi', timestamp: 1001 },
    ];

    for (const e of events) {
      writer.append('test-session-4', e);
    }

    await writer.finalize('test-session-4');

    const readBack: SessionEvent[] = [];
    for await (const event of writer.read('test-session-4')) {
      readBack.push(event);
    }

    // 2 appended + 1 session:complete from finalize
    expect(readBack.length).toBe(3);
    expect(readBack[0].type).toBe('round:start');
    expect(readBack[1].type).toBe('text-delta');
    expect(readBack[2].type).toBe('session:complete');
  });

  it('list() returns finalized sessions only', async () => {
    // Create and finalize one session
    await writer.create('session-a');
    writer.append('session-a', { type: 'round:start', round: 0, timestamp: Date.now() });
    await writer.finalize('session-a');

    // Create but don't finalize another
    await writer.create('session-b');
    writer.append('session-b', { type: 'round:start', round: 0, timestamp: Date.now() });

    const result = await writer.list();
    const ids = result.sessions.map(s => s.id);

    expect(ids).toContain('session-a');
    expect(ids).not.toContain('session-b');
  });

  it('list() supports pagination', async () => {
    // Create 3 finalized sessions
    for (const id of ['s1', 's2', 's3']) {
      await writer.create(id);
      writer.append(id, { type: 'round:start', round: 0, timestamp: Date.now() });
      await writer.finalize(id);
    }

    const page1 = await writer.list({ limit: 2 });
    expect(page1.sessions.length).toBe(2);
    expect(page1.nextCursor).toBeDefined();

    const page2 = await writer.list({ limit: 2, cursor: page1.nextCursor });
    expect(page2.sessions.length).toBe(1);
    expect(page2.nextCursor).toBeUndefined();
  });

  it('throws on append to non-existent session', () => {
    expect(() => {
      writer.append('nonexistent', { type: 'round:start', round: 0, timestamp: Date.now() });
    }).toThrow();
  });

  it('throws on read of non-existent session', async () => {
    await expect(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of writer.read('nonexistent')) {
        // consume
      }
    }).rejects.toThrow();
  });
});
