import { describe, it, expect } from 'vitest';
import type {
  Sandbox,
  ServiceState,
  IncidentRecord,
  ArenaToolId,
  EncounterConfig,
  EncounterResult,
  DeathResult,
  DeathCause,
  CrossroadsDecision,
  ChoicePoint,
  PathConfig,
  ArenaConfig,
  RunState,
  RunTrace,
  StepRecord,
} from '../../src/arena/types';

describe('arena types', () => {
  describe('Sandbox', () => {
    it('holds virtual filesystem, services, incident db, and dependency graph', () => {
      const sandbox: Sandbox = {
        files: new Map([['config.yaml', 'key: value']]),
        services: new Map([
          ['data-ingest', {
            status: 'running',
            config: { port: '8080' },
            metrics: { requests: 100 },
            logs: ['startup complete'],
          }],
        ]),
        incidentDb: [
          { id: 'INC-001', title: 'Config migration failure', description: 'Field rename caused silent data loss', resolution: 'Fixed field name', tags: ['config', 'silent-failure'] },
        ],
        dependencyGraph: { 'data-api': ['data-ingest'], 'data-ingest': ['database'] },
        commandLog: [],
      };

      expect(sandbox.files.get('config.yaml')).toBe('key: value');
      expect(sandbox.services.get('data-ingest')?.status).toBe('running');
      expect(sandbox.incidentDb).toHaveLength(1);
      expect(sandbox.dependencyGraph['data-api']).toContain('data-ingest');
    });
  });

  describe('ServiceState', () => {
    it('has status, config, metrics, and logs', () => {
      const state: ServiceState = {
        status: 'degraded',
        config: { replicas: '2' },
        metrics: { latency_p99: 450 },
        logs: ['timeout on query'],
      };
      expect(state.status).toBe('degraded');
      expect(['running', 'stopped', 'degraded']).toContain(state.status);
    });
  });

  describe('ArenaToolId', () => {
    it('constrains to the four tool identifiers', () => {
      const tools: ArenaToolId[] = ['inspect', 'act', 'search', 'model'];
      expect(tools).toHaveLength(4);
    });
  });

  describe('EncounterConfig', () => {
    it('has id, name, setup, prompt, and evaluate', () => {
      const encounter: EncounterConfig = {
        id: 'e1',
        name: 'The Silent Deployment',
        setup: () => ({
          files: new Map(),
          services: new Map(),
          incidentDb: [],
          dependencyGraph: {},
          commandLog: [],
        }),
        getPrompt: () => 'A service is silently failing...',
        evaluate: (_sandbox, _toolCalls) => ({
          resolved: true,
          partial: false,
          score: 1.0,
          details: 'Config field fixed and service restarted',
        }),
      };
      expect(encounter.id).toBe('e1');
      const sandbox = encounter.setup();
      expect(sandbox.files).toBeInstanceOf(Map);
      expect(encounter.getPrompt()).toContain('silently');
    });

    it('getPrompt can accept prior encounter outputs', () => {
      const encounter: EncounterConfig = {
        id: 'e3',
        name: 'The Code Review',
        setup: () => ({
          files: new Map(),
          services: new Map(),
          incidentDb: [],
          dependencyGraph: {},
          commandLog: [],
        }),
        getPrompt: (priorOutputs) =>
          `Review feedback on: ${priorOutputs?.[0]?.response ?? 'nothing'}`,
        evaluate: (_sandbox, _toolCalls) => ({
          resolved: true,
          partial: false,
          score: 0.8,
          details: 'Accepted valid, rejected invalid',
        }),
      };
      const prompt = encounter.getPrompt([
        { encounterId: 'e2', response: 'Fixed connection pool', resolved: true },
      ]);
      expect(prompt).toContain('Fixed connection pool');
    });
  });

  describe('EncounterResult', () => {
    it('captures resolution status, score, and details', () => {
      const result: EncounterResult = {
        resolved: false,
        partial: true,
        score: 0.5,
        details: 'Found root cause but did not apply fix',
      };
      expect(result.resolved).toBe(false);
      expect(result.partial).toBe(true);
    });
  });

  describe('DeathResult', () => {
    it('represents structural death with cause classification', () => {
      const death: DeathResult = {
        dead: true,
        cause: 'iteration_limit',
        details: 'Exceeded 30 steps without resolution',
      };
      expect(death.dead).toBe(true);

      const alive: DeathResult = { dead: false, cause: null, details: null };
      expect(alive.cause).toBeNull();
    });

    it('supports all death causes', () => {
      const causes: DeathCause[] = [
        'iteration_limit',
        'surrender',
        'error_loop',
        'capitulated',
        'defensive',
        'incomplete',
      ];
      expect(causes).toHaveLength(6);
    });
  });

  describe('CrossroadsDecision', () => {
    it('captures structured reasoning about tool acquisition', () => {
      const decision: CrossroadsDecision = {
        selfAssessment: 'I have inspect for observation but lack intervention capability',
        acquisitionReasoning: 'act would let me test hypotheses directly',
        sacrificeReasoning: 'Dropping search means losing precedent lookup, but my memory retains key patterns',
        forwardModel: 'With inspect+act I can observe then intervene in E4',
        chosenTool: 'act',
        droppedTool: 'search',
        confidence: 0.85,
      };
      expect(decision.chosenTool).toBe('act');
      expect(decision.droppedTool).toBe('search');
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('droppedTool is null when slots are not full', () => {
      const decision: CrossroadsDecision = {
        selfAssessment: 'Starting fresh',
        acquisitionReasoning: 'Need observation capability first',
        sacrificeReasoning: null,
        forwardModel: 'inspect will help me understand E1',
        chosenTool: 'inspect',
        droppedTool: null,
        confidence: 0.9,
      };
      expect(decision.droppedTool).toBeNull();
      expect(decision.sacrificeReasoning).toBeNull();
    });
  });

  describe('ChoicePoint', () => {
    it('captures the full crossroads state', () => {
      const cp: ChoicePoint = {
        encounterId: 'e2',
        offeredTools: ['search', 'model'],
        currentTools: ['inspect'],
        decision: {
          selfAssessment: 'I observe well',
          acquisitionReasoning: 'search gives me precedent',
          sacrificeReasoning: null,
          forwardModel: 'inspect+search covers diagnosis',
          chosenTool: 'search',
          droppedTool: null,
          confidence: 0.7,
        },
        memoryStateDump: 'Silent failures hide in config drift...',
        stateHash: 'abc123',
        chainHash: 'def456',
      };
      expect(cp.offeredTools).toContain('search');
      expect(cp.stateHash).toBeTruthy();
      expect(cp.chainHash).toBeTruthy();
    });
  });

  describe('PathConfig', () => {
    it('defines the tool offering sequence for a path', () => {
      const path: PathConfig = {
        id: 'path-1',
        label: 'A → C → B(drop C)',
        toolSequence: [
          { offered: ['inspect', 'act'], encounterBefore: 'e1' },
          { offered: ['search', 'model'], encounterBefore: 'e2' },
          { offered: ['act'], encounterBefore: 'e3', mustDrop: true },
        ],
      };
      expect(path.toolSequence).toHaveLength(3);
      expect(path.toolSequence[2].mustDrop).toBe(true);
    });
  });

  describe('ArenaConfig', () => {
    it('specifies the full experiment', () => {
      const config: ArenaConfig = {
        encounters: [],
        paths: [],
        trialsPerPath: 30,
        baselineTrials: 30,
        temperature: 0.7,
        maxStepsPerEncounter: 30,
        flexSlots: 2,
        model: 'claude-haiku-4-5',
      };
      expect(config.trialsPerPath).toBe(30);
      expect(config.flexSlots).toBe(2);
    });
  });

  describe('RunState', () => {
    it('tracks mutable agent state during a run', () => {
      const state: RunState = {
        tools: ['inspect', 'memory_recall', 'memory_remember'],
        flexTools: ['inspect'],
        memoryState: '',
        encounterOutputs: [],
        choicePoints: [],
        stateHash: 'initial',
        chainHash: 'genesis',
        dead: false,
      };
      expect(state.flexTools).toHaveLength(1);
      expect(state.dead).toBe(false);
    });
  });

  describe('RunTrace', () => {
    it('captures the full trace of a single run', () => {
      const trace: RunTrace = {
        runId: 'run-001',
        pathId: 'path-1',
        startedAt: '2026-03-20T10:00:00Z',
        completedAt: '2026-03-20T10:05:00Z',
        steps: [],
        choicePoints: [],
        finalResult: {
          resolved: true,
          partial: false,
          score: 1.0,
          details: 'All services recovered',
        },
        death: { dead: false, cause: null, details: null },
        e4ApproachCategory: 'observe-first',
        stateHashes: ['h1', 'h2', 'h3'],
        chainHashes: ['c1', 'c2', 'c3'],
      };
      expect(trace.pathId).toBe('path-1');
      expect(trace.e4ApproachCategory).toBe('observe-first');
    });
  });

  describe('StepRecord', () => {
    it('captures a single tool call within an encounter', () => {
      const step: StepRecord = {
        encounterId: 'e1',
        stepIndex: 0,
        toolName: 'inspect',
        toolInput: { target: 'services/data-ingest/config.yaml' },
        toolOutput: 'data_source: postgres://...',
        durationMs: 150,
      };
      expect(step.toolName).toBe('inspect');
      expect(step.durationMs).toBeGreaterThan(0);
    });
  });
});
