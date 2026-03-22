import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DeathCard } from '@/components/DeathCard';
import type { GraveyardEntry } from '@/lib/graveyard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const entry: GraveyardEntry = {
  agentId: 'a1',
  tournamentId: 'tid-1',
  tools: ['inspect', 'act'],
  encounterId: 'e1',
  score: 0.2,
  stepCount: 5,
  deathCause: 'iteration_limit',
  collateral: 0,
  interestingness: 4.5,
  epitaph: '[inspect+act] ran out of time in e1 after 5 steps',
};

describe('DeathCard', () => {
  it('renders tool badges', () => {
    render(<DeathCard entry={entry} />);
    expect(screen.getByText('inspect')).toBeTruthy();
    expect(screen.getByText('act')).toBeTruthy();
  });

  it('renders epitaph text', () => {
    const { container } = render(<DeathCard entry={entry} />);
    expect(container.textContent).toContain(entry.epitaph);
  });

  it('renders score and encounter info', () => {
    const { container } = render(<DeathCard entry={entry} />);
    const text = container.textContent ?? '';
    expect(text).toContain('0.20');
    expect(text).toContain('e1');
  });

  it('links to replay URL', () => {
    const { container } = render(<DeathCard entry={entry} />);
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/arena/tid-1/a1/e1');
  });

  it('renders featured variant with prominence', () => {
    render(<DeathCard entry={entry} featured />);
    const container = document.querySelector('[data-featured]');
    expect(container).toBeTruthy();
  });
});
