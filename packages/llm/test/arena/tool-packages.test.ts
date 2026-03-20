import { describe, it, expect } from 'vitest';
import { createArenaToolPackage, ARENA_TOOL_CONFIGS } from '../../src/arena/tool-packages';
import type { Sandbox } from '../../src/arena/types';

function emptySandbox(): Sandbox {
  return {
    files: new Map(),
    services: new Map(),
    incidentDb: [],
    dependencyGraph: {},
    commandLog: [],
  };
}

describe('ARENA_TOOL_CONFIGS', () => {
  it('defines configs for all 4 tool IDs', () => {
    expect(Object.keys(ARENA_TOOL_CONFIGS).sort()).toEqual(['act', 'inspect', 'model', 'search']);
  });

  it('each config has a derived prompt fragment', () => {
    for (const [id, config] of Object.entries(ARENA_TOOL_CONFIGS)) {
      expect(config.derivedPromptFragment.length).toBeGreaterThan(50);
      expect(config.intent).toHaveLength(2);
      expect(typeof config.sideEffects).toBe('boolean');
    }
  });

  it('only act has sideEffects', () => {
    expect(ARENA_TOOL_CONFIGS.act.sideEffects).toBe(true);
    expect(ARENA_TOOL_CONFIGS.inspect.sideEffects).toBe(false);
    expect(ARENA_TOOL_CONFIGS.search.sideEffects).toBe(false);
    expect(ARENA_TOOL_CONFIGS.model.sideEffects).toBe(false);
  });
});

describe('createArenaToolPackage', () => {
  it('creates a valid ToolPackage for inspect', () => {
    const sandbox = emptySandbox();
    const pkg = createArenaToolPackage('inspect', sandbox);
    expect(pkg.tools).toHaveLength(1);
    expect(pkg.tools[0].name).toBe('inspect');
    expect(pkg.metadata.name).toBe('arena-inspect');
    expect(pkg.metadata.sideEffects).toBe(false);
    expect(pkg.metadata.intent).toContain('observe');
  });

  it('creates a valid ToolPackage for act', () => {
    const sandbox = emptySandbox();
    const pkg = createArenaToolPackage('act', sandbox);
    expect(pkg.tools).toHaveLength(1);
    expect(pkg.tools[0].name).toBe('act');
    expect(pkg.metadata.sideEffects).toBe(true);
  });

  it('formatContext returns the derived prompt fragment', () => {
    const sandbox = emptySandbox();
    const pkg = createArenaToolPackage('inspect', sandbox);
    expect(pkg.formatContext()).toContain('observation');
  });

  it('creates packages for all 4 tools', () => {
    const sandbox = emptySandbox();
    const ids = ['inspect', 'act', 'search', 'model'] as const;
    const pkgs = ids.map(id => createArenaToolPackage(id, sandbox));
    expect(pkgs).toHaveLength(4);
    const names = pkgs.map(p => p.metadata.name).sort();
    expect(names).toEqual(['arena-act', 'arena-inspect', 'arena-model', 'arena-search']);
  });
});
