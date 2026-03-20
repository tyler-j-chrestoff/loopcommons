import { describe, it, expect } from 'vitest';
import type { ToolPackage } from '../../llm/src/tool';
import { createResumePackage } from '../src/tools/resume';
import { createProjectPackage } from '../src/tools/project';
import { createBlogToolPackage } from '../src/tools/blog';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

function tmpBlogDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blog-pkg-'));
  fs.mkdirSync(path.join(dir, 'published'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'drafts'), { recursive: true });
  return dir;
}

/** Inline contract tests — same assertions as packages/llm/test/tool-package.test.ts */
function runContract(name: string, createPackage: () => ToolPackage) {
  describe(`ToolPackage contract: ${name}`, () => {
    it('has a non-empty name in metadata', () => {
      expect(createPackage().metadata.name).toBeTruthy();
    });
    it('has a capabilities array', () => {
      const caps = createPackage().metadata.capabilities;
      expect(Array.isArray(caps) && caps.length > 0).toBe(true);
    });
    it('has an intent array', () => {
      const intent = createPackage().metadata.intent;
      expect(Array.isArray(intent) && intent.length > 0).toBe(true);
    });
    it('has a sideEffects boolean', () => {
      expect(typeof createPackage().metadata.sideEffects).toBe('boolean');
    });
    it('exposes at least one tool', () => {
      expect(createPackage().tools.length).toBeGreaterThan(0);
    });
    it('each tool has name, description, parameters, execute', () => {
      for (const t of createPackage().tools) {
        expect(typeof t.name).toBe('string');
        expect(typeof t.description).toBe('string');
        expect(t.parameters).toBeDefined();
        expect(typeof t.execute).toBe('function');
      }
    });
    it('tool names are unique', () => {
      const names = createPackage().tools.map(t => t.name);
      expect(new Set(names).size).toBe(names.length);
    });
    it('formatContext returns a string', () => {
      expect(typeof createPackage().formatContext()).toBe('string');
    });
  });
}

describe('Web ToolPackages', () => {
  runContract('resume', createResumePackage);
  runContract('project', createProjectPackage);
  runContract('blog-reader', () =>
    createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'reader' }),
  );
  runContract('blog-writer', () =>
    createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'writer' }),
  );

  describe('resume package', () => {
    it('has intent ["resume"]', () => {
      expect(createResumePackage().metadata.intent).toEqual(['resume']);
    });
    it('has sideEffects: false', () => {
      expect(createResumePackage().metadata.sideEffects).toBe(false);
    });
    it('exposes get_resume tool', () => {
      expect(createResumePackage().tools.map(t => t.name)).toEqual(['get_resume']);
    });
  });

  describe('project package', () => {
    it('has intent ["project"]', () => {
      expect(createProjectPackage().metadata.intent).toEqual(['project']);
    });
    it('has sideEffects: false', () => {
      expect(createProjectPackage().metadata.sideEffects).toBe(false);
    });
    it('exposes get_project tool', () => {
      expect(createProjectPackage().tools.map(t => t.name)).toEqual(['get_project']);
    });
  });

  describe('blog-reader package', () => {
    it('has sideEffects: false', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'reader' });
      expect(pkg.metadata.sideEffects).toBe(false);
    });
    it('does not have authRequired', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'reader' });
      expect(pkg.metadata.authRequired).toBeUndefined();
    });
    it('exposes only read tools', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'reader' });
      expect(pkg.tools.map(t => t.name)).toEqual(['list_posts', 'read_post']);
    });
  });

  describe('blog-writer package', () => {
    it('has sideEffects: true', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'writer' });
      expect(pkg.metadata.sideEffects).toBe(true);
    });
    it('has authRequired: true', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'writer' });
      expect(pkg.metadata.authRequired).toBe(true);
    });
    it('exposes all 8 blog tools', () => {
      const pkg = createBlogToolPackage({ dataDir: tmpBlogDir(), variant: 'writer' });
      expect(pkg.tools.length).toBe(8);
    });
  });
});
