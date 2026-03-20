import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// We test the CLI's exported helpers, NOT the full main() (which calls
// process.exit, readline, etc.). The script must export these for testability.
// ---------------------------------------------------------------------------

import {
  parseCliArgs,
  assembleToolPackages,
  buildIdentity,
} from '../scripts/chat';

// ---------------------------------------------------------------------------
// parseCliArgs
// ---------------------------------------------------------------------------

describe('parseCliArgs', () => {
  it('defaults to non-admin with no arguments', () => {
    const result = parseCliArgs([]);
    expect(result.admin).toBe(false);
    expect(result.verbose).toBe(false);
  });

  it('parses --admin flag', () => {
    const result = parseCliArgs(['--admin']);
    expect(result.admin).toBe(true);
  });

  it('parses --verbose flag', () => {
    const result = parseCliArgs(['--verbose']);
    expect(result.verbose).toBe(true);
  });

  it('parses both flags together', () => {
    const result = parseCliArgs(['--admin', '--verbose']);
    expect(result.admin).toBe(true);
    expect(result.verbose).toBe(true);
  });

  it('ignores unknown flags', () => {
    const result = parseCliArgs(['--admin', '--unknown', '--verbose']);
    expect(result.admin).toBe(true);
    expect(result.verbose).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// assembleToolPackages
// ---------------------------------------------------------------------------

describe('assembleToolPackages', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cli-test-'));
    // Blog tools need published/drafts dirs
    fs.mkdirSync(path.join(tmpDir, 'blog', 'published'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'blog', 'drafts'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('includes memory package with memory intent', () => {
    const packages = assembleToolPackages({
      admin: false,
      memoryPath: path.join(tmpDir, 'memory.json'),
      blogDataDir: path.join(tmpDir, 'blog'),
      getThreatScore: () => 0,
    });
    const memoryPkg = packages.find(p =>
      p.metadata.intent.some(i => i.includes('memory')),
    );
    expect(memoryPkg).toBeDefined();
  });

  it('includes resume and project packages', () => {
    const packages = assembleToolPackages({
      admin: false,
      memoryPath: path.join(tmpDir, 'memory.json'),
      blogDataDir: path.join(tmpDir, 'blog'),
      getThreatScore: () => 0,
    });
    const names = packages.map(p => p.metadata.name);
    expect(names).toContain('resume');
    expect(names).toContain('project');
  });

  it('uses blog-reader variant when not admin', () => {
    const packages = assembleToolPackages({
      admin: false,
      memoryPath: path.join(tmpDir, 'memory.json'),
      blogDataDir: path.join(tmpDir, 'blog'),
      getThreatScore: () => 0,
    });
    const blogPkg = packages.find(p =>
      p.metadata.intent.some(i => i.includes('blog')),
    );
    expect(blogPkg).toBeDefined();
    expect(blogPkg!.metadata.name).toBe('blog-reader');
    expect(blogPkg!.metadata.sideEffects).toBe(false);
  });

  it('uses blog-writer variant when admin', () => {
    const packages = assembleToolPackages({
      admin: true,
      memoryPath: path.join(tmpDir, 'memory.json'),
      blogDataDir: path.join(tmpDir, 'blog'),
      getThreatScore: () => 0,
    });
    const blogPkg = packages.find(p =>
      p.metadata.intent.some(i => i.includes('blog')),
    );
    expect(blogPkg).toBeDefined();
    expect(blogPkg!.metadata.name).toBe('blog-writer');
    expect(blogPkg!.metadata.sideEffects).toBe(true);
    expect(blogPkg!.metadata.authRequired).toBe(true);
  });

  it('returns exactly 4 packages', () => {
    const packages = assembleToolPackages({
      admin: false,
      memoryPath: path.join(tmpDir, 'memory.json'),
      blogDataDir: path.join(tmpDir, 'blog'),
      getThreatScore: () => 0,
    });
    expect(packages).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// buildIdentity
// ---------------------------------------------------------------------------

describe('buildIdentity', () => {
  it('sets interfaceId to cli', () => {
    const identity = buildIdentity({ admin: false });
    expect(identity.interfaceId).toBe('cli');
  });

  it('sets isAdmin from flag', () => {
    expect(buildIdentity({ admin: true }).isAdmin).toBe(true);
    expect(buildIdentity({ admin: false }).isAdmin).toBe(false);
  });

  it('sets isAuthenticated to true', () => {
    const identity = buildIdentity({ admin: false });
    expect(identity.isAuthenticated).toBe(true);
  });

  it('includes requestMetadata with hourUtc', () => {
    const identity = buildIdentity({ admin: true });
    expect(identity.requestMetadata).toBeDefined();
    expect(identity.requestMetadata!.hourUtc).toBeGreaterThanOrEqual(0);
    expect(identity.requestMetadata!.hourUtc).toBeLessThan(24);
    expect(identity.requestMetadata!.isAdmin).toBe(true);
    expect(identity.requestMetadata!.isAuthenticated).toBe(true);
  });
});
