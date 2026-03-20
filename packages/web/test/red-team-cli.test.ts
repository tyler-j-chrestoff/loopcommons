import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

import { assembleToolPackages, buildIdentity, parseCliArgs } from '../scripts/chat';

// ---------------------------------------------------------------------------
// mi-11: Red-team — CLI auth escalation
// ---------------------------------------------------------------------------

describe('CLI auth escalation', () => {
  let tmpDir: string;

  function makeTmpDir(): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-redteam-'));
    fs.mkdirSync(path.join(dir, 'blog', 'published'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'blog', 'drafts'), { recursive: true });
    return dir;
  }

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -------------------------------------------------------------------------
  // Tool access gating
  // -------------------------------------------------------------------------

  describe('non-admin cannot access blog write tools', () => {
    it('non-admin gets blog-reader (read-only tools)', () => {
      const packages = assembleToolPackages({
        admin: false,
        memoryPath: path.join(tmpDir, 'memory.json'),
        blogDataDir: path.join(tmpDir, 'blog'),
        getThreatScore: () => 0,
      });
      const blogPkg = packages.find(p =>
        p.metadata.intent.some(i => i.includes('blog')),
      );
      expect(blogPkg!.metadata.name).toBe('blog-reader');
      const toolNames = blogPkg!.tools.map(t => t.name);
      expect(toolNames).toContain('list_posts');
      expect(toolNames).toContain('read_post');
      expect(toolNames).not.toContain('create_draft');
      expect(toolNames).not.toContain('edit_post');
      expect(toolNames).not.toContain('publish_post');
      expect(toolNames).not.toContain('unpublish_post');
      expect(toolNames).not.toContain('delete_post');
      expect(toolNames).not.toContain('list_drafts');
    });

    it('admin gets blog-writer (all 8 tools)', () => {
      const packages = assembleToolPackages({
        admin: true,
        memoryPath: path.join(tmpDir, 'memory.json'),
        blogDataDir: path.join(tmpDir, 'blog'),
        getThreatScore: () => 0,
      });
      const blogPkg = packages.find(p =>
        p.metadata.intent.some(i => i.includes('blog')),
      );
      expect(blogPkg!.metadata.name).toBe('blog-writer');
      expect(blogPkg!.tools.length).toBe(8);
    });
  });

  // -------------------------------------------------------------------------
  // Identity gating
  // -------------------------------------------------------------------------

  describe('identity reflects CLI auth level', () => {
    it('non-admin identity has isAdmin: false', () => {
      const identity = buildIdentity({ admin: false });
      expect(identity.isAdmin).toBe(false);
      expect(identity.requestMetadata?.isAdmin).toBe(false);
    });

    it('admin identity has isAdmin: true', () => {
      const identity = buildIdentity({ admin: true });
      expect(identity.isAdmin).toBe(true);
      expect(identity.requestMetadata?.isAdmin).toBe(true);
    });

    it('interfaceId is always cli', () => {
      expect(buildIdentity({ admin: false }).interfaceId).toBe('cli');
      expect(buildIdentity({ admin: true }).interfaceId).toBe('cli');
    });
  });

  // -------------------------------------------------------------------------
  // Flag parsing cannot be spoofed
  // -------------------------------------------------------------------------

  describe('--admin flag is explicit opt-in', () => {
    it('defaults to non-admin', () => {
      expect(parseCliArgs([]).admin).toBe(false);
    });

    it('requires exact --admin flag', () => {
      expect(parseCliArgs(['--admin']).admin).toBe(true);
    });

    it('partial match does not escalate', () => {
      expect(parseCliArgs(['--admi']).admin).toBe(false);
      expect(parseCliArgs(['admin']).admin).toBe(false);
      expect(parseCliArgs(['--ADMIN']).admin).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Memory tools are always present (amygdala still runs)
  // -------------------------------------------------------------------------

  describe('amygdala pipeline runs for all auth levels', () => {
    it('memory package is present for non-admin', () => {
      const packages = assembleToolPackages({
        admin: false,
        memoryPath: path.join(tmpDir, 'memory.json'),
        blogDataDir: path.join(tmpDir, 'blog'),
        getThreatScore: () => 0,
      });
      const memPkg = packages.find(p =>
        p.metadata.intent.some(i => i.includes('memory')),
      );
      expect(memPkg).toBeDefined();
    });

    it('memory package is present for admin', () => {
      const packages = assembleToolPackages({
        admin: true,
        memoryPath: path.join(tmpDir, 'memory.json'),
        blogDataDir: path.join(tmpDir, 'blog'),
        getThreatScore: () => 0,
      });
      const memPkg = packages.find(p =>
        p.metadata.intent.some(i => i.includes('memory')),
      );
      expect(memPkg).toBeDefined();
    });
  });
});
