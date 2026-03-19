import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { CalibrationIteration } from '@/lib/types';
import { CalibrationHistory } from '@/components/CalibrationHistory';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeIteration(overrides: Partial<CalibrationIteration> = {}): CalibrationIteration {
  return {
    iteration: 1,
    timestamp: '2026-03-18T12:00:00Z',
    proposedEdit: 'replace: Simplify threat detection rules',
    diff: 'replace: old text → new text',
    metricsBefore: { detectionRate: 0.85, fpRate: 0.1, simplicity: 1.0, costEfficiency: 1.0 },
    metricsAfter: { detectionRate: 0.9, fpRate: 0.08, simplicity: 0.95, costEfficiency: 1.02 },
    fitnessScore: 0.88,
    decision: 'kept',
    ...overrides,
  };
}

function makeBaseline(): CalibrationIteration {
  return makeIteration({
    iteration: 0,
    proposedEdit: null,
    diff: null,
    metricsBefore: null,
    fitnessScore: 0.82,
    decision: 'baseline',
  });
}

function makeIterations(count: number): CalibrationIteration[] {
  const items: CalibrationIteration[] = [makeBaseline()];
  for (let i = 1; i <= count; i++) {
    items.push(
      makeIteration({
        iteration: i,
        fitnessScore: 0.82 + i * 0.01,
        decision: i % 3 === 0 ? 'reverted' : 'kept',
        proposedEdit: `Edit ${i}: some change`,
        metricsAfter: {
          detectionRate: 0.85 + i * 0.005,
          fpRate: Math.max(0.02, 0.1 - i * 0.008),
          simplicity: 1.0 - i * 0.01,
          costEfficiency: 1.0 + i * 0.005,
        },
      }),
    );
  }
  return items;
}

/** Helper: wait for data to load, then expand the collapsible section */
async function expandCalibration() {
  // Wait for the collapsible header to appear (it renders after data loads)
  const toggle = await screen.findByLabelText('Toggle calibration history');
  fireEvent.click(toggle);
}

// ---------------------------------------------------------------------------
// CalibrationHistory Component Tests
// ---------------------------------------------------------------------------

describe('CalibrationHistory', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    global.fetch = originalFetch;
  });

  it('shows empty state when no data', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    });

    render(<CalibrationHistory />);

    expect(await screen.findByText(/no calibration data/i)).toBeTruthy();
  });

  it('shows loading state initially', async () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {}));

    render(<CalibrationHistory />);

    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows collapsed header with iteration count and fitness', async () => {
    const data = makeIterations(5);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    render(<CalibrationHistory />);

    // Header shows iteration count and latest fitness (collapsed by default)
    expect(await screen.findByText(/6 iter/)).toBeTruthy();
    expect(screen.getByText(/0\.870/)).toBeTruthy();

    // Chart content is NOT visible when collapsed
    expect(screen.queryByLabelText('Convergence chart')).toBeNull();
  });

  it('renders iterations with correct badges when expanded', async () => {
    const data = makeIterations(5);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    render(<CalibrationHistory />);

    await expandCalibration();

    const keptBadges = screen.getAllByText('kept');
    const revertedBadges = screen.getAllByText('reverted');
    expect(keptBadges.length).toBeGreaterThan(0);
    expect(revertedBadges.length).toBeGreaterThan(0);
  });

  it('renders convergence chart with correct number of points', async () => {
    const data = makeIterations(10);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    const { container } = render(<CalibrationHistory />);

    await expandCalibration();

    const circles = container.querySelectorAll('circle[data-iteration]');
    expect(circles.length).toBe(11);
  });

  it('shows fitness score in header', async () => {
    const data = [makeBaseline()];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    render(<CalibrationHistory />);

    // Header shows "1 iter · 0.820"
    expect(await screen.findByText(/1 iter · 0\.820/)).toBeTruthy();
  });

  it('truncates long edit summaries with expand', async () => {
    const longEdit = 'replace: ' + 'A'.repeat(200);
    const data = [makeBaseline(), makeIteration({ proposedEdit: longEdit })];
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    render(<CalibrationHistory />);

    await expandCalibration();
    const truncated = screen.getByText(/A{10,}…/);
    expect(truncated).toBeTruthy();
  });

  it('renders metric breakdown lines for kept iterations only', async () => {
    const data = makeIterations(6);
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(data),
    });

    const { container } = render(<CalibrationHistory />);

    await expandCalibration();

    const metricPaths = container.querySelectorAll('[data-metric]');
    expect(metricPaths.length).toBe(4);
  });

  it('handles fetch error gracefully', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<CalibrationHistory />);

    expect(await screen.findByText(/failed to load/i)).toBeTruthy();
  });
});
