'use client';

import { useState, type ReactNode } from 'react';

type LayoutProps = {
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
  metricsPanel?: ReactNode;
};

export function Layout({ header, main, sidebar, metricsPanel }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-surface px-4">
        {header}
        <div className="flex items-center gap-2">
          {metricsPanel && (
            <button
              onClick={() => setMetricsOpen(!metricsOpen)}
              className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text"
              aria-label={metricsOpen ? 'Hide pipeline metrics' : 'Show pipeline metrics'}
            >
              {metricsOpen ? 'Hide Metrics' : 'Pipeline Metrics'}
            </button>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text"
            aria-label={sidebarOpen ? 'Hide trace inspector' : 'Show trace inspector'}
          >
            {sidebarOpen ? 'Hide Trace' : 'Show Trace'}
          </button>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Metrics panel (left side) */}
        {metricsPanel && metricsOpen && (
          <aside className="w-96 shrink-0 overflow-y-auto border-r border-border bg-bg-surface">
            {metricsPanel}
          </aside>
        )}

        {/* Main panel */}
        <main className="flex min-w-0 flex-1 flex-col">{main}</main>

        {/* Sidebar (right side) */}
        {sidebarOpen && (
          <aside className="w-96 shrink-0 overflow-y-auto border-l border-border bg-bg-surface">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
