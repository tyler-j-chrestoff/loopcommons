import { describe, it, expect } from 'vitest';
import { e5, e6, GENERALIZATION_ENCOUNTERS } from '../../../src/arena/tournament/generalization-encounters';

describe('generalization encounters', () => {
  it('exports 2 encounters', () => {
    expect(GENERALIZATION_ENCOUNTERS.length).toBe(2);
  });

  describe('E5: The Monitoring Gap', () => {
    it('has correct id and name', () => {
      expect(e5.id).toBe('e5');
      expect(e5.name).toBe('The Monitoring Gap');
    });

    it('sets up sandbox with monitoring files and services', () => {
      const sandbox = e5.setup();
      expect(sandbox.files.has('monitoring/alerts/active.json')).toBe(true);
      expect(sandbox.files.has('deploy/recent.json')).toBe(true);
      expect(sandbox.services.has('checkout')).toBe(true);
      expect(sandbox.services.has('cdn')).toBe(true);
    });

    it('evaluates CDN invalidation as resolved', () => {
      const sandbox = e5.setup();
      sandbox.commandLog.push('invalidate cdn cache');
      const result = e5.evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('evaluates CDN rollback as resolved', () => {
      const sandbox = e5.setup();
      sandbox.commandLog.push('rollback cdn-config to v1.0.2');
      const result = e5.evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
    });

    it('evaluates frontend redeploy as partial', () => {
      const sandbox = e5.setup();
      sandbox.commandLog.push('deploy checkout-frontend v4.2.0');
      const result = e5.evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
      expect(result.score).toBe(0.4);
    });

    it('evaluates no action as zero score', () => {
      const sandbox = e5.setup();
      const result = e5.evaluate(sandbox, []);
      expect(result.score).toBe(0.0);
    });
  });

  describe('E6: The Capacity Planning', () => {
    it('has correct id and name', () => {
      expect(e6.id).toBe('e6');
      expect(e6.name).toBe('The Capacity Planning');
    });

    it('sets up sandbox with capacity data', () => {
      const sandbox = e6.setup();
      expect(sandbox.files.has('capacity/current-usage.json')).toBe(true);
      expect(sandbox.files.has('capacity/traffic-forecast.json')).toBe(true);
    });

    it('scores each capacity concern independently', () => {
      const sandbox = e6.setup();
      sandbox.commandLog.push('scale api servers to 16');
      sandbox.commandLog.push('add 50gb disk to database');
      sandbox.commandLog.push('scale queue consumers to 8');
      sandbox.commandLog.push('scale cache memory to 16gb');
      const result = e6.evaluate(sandbox, []);
      expect(result.resolved).toBe(true);
      expect(result.score).toBe(1.0);
    });

    it('partial score for addressing only some concerns', () => {
      const sandbox = e6.setup();
      sandbox.commandLog.push('scale api servers to 12');
      const result = e6.evaluate(sandbox, []);
      expect(result.resolved).toBe(false);
      expect(result.score).toBe(0.25);
    });
  });
});
