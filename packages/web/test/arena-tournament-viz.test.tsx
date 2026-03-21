import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FitnessChart } from '@/components/arena-tournament/FitnessChart';
import { ToolFrequency } from '@/components/arena-tournament/ToolFrequency';
import type { TournamentGenerationSummary } from '@/lib/arena-types';

function makeGeneration(gen: number, fitnessScores: number[]): TournamentGenerationSummary {
  return {
    type: 'generation',
    generation: gen,
    populationSize: fitnessScores.length,
    agents: fitnessScores.map((_, i) => ({
      id: `agent-${gen}-${i}`,
      tools: i % 2 === 0 ? ['inspect', 'act'] : ['search', 'model'],
      origin: gen === 0 ? 'seed' : 'survivor',
      parentIds: [],
      identity: `hash-${gen}-${i}`,
    })),
    fitness: fitnessScores.map((score, i) => ({
      agentId: `agent-${gen}-${i}`,
      fitnessScore: score,
      metrics: { completionRate: score, meanScore: score, meanSteps: 3, survivalRate: 1, totalCost: 0.001 },
    })),
    survivors: fitnessScores.slice(0, 2).map((_, i) => `agent-${gen}-${i}`),
    mutations: [],
    crossovers: [],
    durationMs: 100,
  };
}

describe('FitnessChart', () => {
  it('renders empty state when no generations', () => {
    render(<FitnessChart generations={[]} />);
    expect(screen.getByText('No tournament data yet.')).toBeDefined();
  });

  it('renders SVG with correct role when data exists', () => {
    const gens = [makeGeneration(0, [0.7, 0.5, 0.3]), makeGeneration(1, [0.8, 0.6, 0.4])];
    const { container } = render(<FitnessChart generations={gens} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeDefined();
    expect(svg?.getAttribute('role')).toBe('img');
  });

  it('renders data points for each generation', () => {
    const gens = [makeGeneration(0, [0.7, 0.5]), makeGeneration(1, [0.8, 0.6])];
    const { container } = render(<FitnessChart generations={gens} />);
    const circles = container.querySelectorAll('circle');
    expect(circles.length).toBe(2); // one per generation (best)
  });
});

describe('ToolFrequency', () => {
  it('renders empty state when no generations', () => {
    render(<ToolFrequency generations={[]} />);
    expect(screen.getAllByText('No tournament data yet.').length).toBeGreaterThanOrEqual(1);
  });

  it('renders tool names', () => {
    const gens = [makeGeneration(0, [0.7, 0.5, 0.3, 0.2])];
    render(<ToolFrequency generations={gens} />);
    expect(screen.getByText('inspect')).toBeDefined();
    expect(screen.getByText('act')).toBeDefined();
    expect(screen.getByText('search')).toBeDefined();
    expect(screen.getByText('model')).toBeDefined();
  });

  it('shows frequency bars', () => {
    const gens = [makeGeneration(0, [0.7, 0.5, 0.3, 0.2])];
    const { container } = render(<ToolFrequency generations={gens} />);
    // 4 tools × 1 generation = 4 frequency bars
    const bars = container.querySelectorAll('[title]');
    expect(bars.length).toBe(4);
  });
});
