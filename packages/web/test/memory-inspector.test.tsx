/**
 * memory-inspector.test.tsx — Tests for MemoryInspector component.
 *
 * Collapsible panel showing memory recall + writes.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryInspector } from '../src/components/MemoryInspector';
import type { MemoryActivity } from '../src/lib/types';

describe('MemoryInspector', () => {
  afterEach(() => cleanup());
  it('renders empty state when no memory data', () => {
    render(<MemoryInspector memory={undefined} />);
    expect(screen.getByText(/no memory activity/i)).toBeDefined();
  });

  it('shows recall count', () => {
    const memory: MemoryActivity = {
      memoriesRetrieved: 3,
      memoryTypes: { observation: 2, learning: 1 },
      memoriesWritten: [],
    };
    render(<MemoryInspector memory={memory} />);
    expect(screen.getByText('3')).toBeDefined();
    expect(screen.getByText(/recalled/i)).toBeDefined();
  });

  it('shows write count', () => {
    const memory: MemoryActivity = {
      memoriesRetrieved: 0,
      memoryTypes: {},
      memoriesWritten: [
        {
          memory: {
            id: '1',
            type: 'observation',
            subject: 'test',
            content: 'test content',
            provenance: { agent: 'loop-commons-agent', timestamp: '2026-01-01T00:00:00Z', used: [] },
            modality: 'observation',
            uncertainty: 0.3,
            visibility: 'local',
            tags: [],
            updatedAt: '2026-01-01T00:00:00Z',
            accessCount: 0,
          },
          gatedBy: 0.1,
          deduplication: 'new',
        },
      ],
    };
    render(<MemoryInspector memory={memory} />);
    // Check the summary line contains written count
    expect(screen.getByText(/written/i).textContent).toContain('1');
  });

  it('is collapsible', () => {
    const memory: MemoryActivity = {
      memoriesRetrieved: 2,
      memoryTypes: { observation: 2 },
      memoriesWritten: [],
    };
    render(<MemoryInspector memory={memory} />);

    // Find the main collapse toggle (has "Memory" label)
    const toggleButton = screen.getByText('Memory').closest('button')!;
    expect(toggleButton).toBeDefined();

    // Click to expand
    fireEvent.click(toggleButton);

    // Should show type breakdown
    expect(screen.getByText(/observation: 2/i)).toBeDefined();
  });

  it('shows deduplication indicator for reinforced writes', () => {
    const memory: MemoryActivity = {
      memoriesRetrieved: 0,
      memoryTypes: {},
      memoriesWritten: [
        {
          memory: {
            id: '1',
            type: 'observation',
            subject: 'test',
            content: 'reinforced content',
            provenance: { agent: 'loop-commons-agent', timestamp: '2026-01-01T00:00:00Z', used: ['old-id'] },
            modality: 'observation',
            uncertainty: 0.2,
            visibility: 'local',
            tags: [],
            updatedAt: '2026-01-01T00:00:00Z',
            accessCount: 0,
          },
          gatedBy: 0.1,
          deduplication: 'reinforced',
        },
      ],
    };
    render(<MemoryInspector memory={memory} />);

    // Expand via the main toggle
    fireEvent.click(screen.getByText('Memory').closest('button')!);

    // Should show reinforced indicator (may appear in both summary and detail)
    expect(screen.getAllByText(/reinforced/i).length).toBeGreaterThanOrEqual(1);
  });
});
