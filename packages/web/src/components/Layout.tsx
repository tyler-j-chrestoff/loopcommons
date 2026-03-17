'use client';

import { useState, type ReactNode } from 'react';

type LayoutProps = {
  header: ReactNode;
  main: ReactNode;
  sidebar: ReactNode;
};

export function Layout({ header, main, sidebar }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-bg-surface px-4">
        {header}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded px-2 py-1 text-sm text-text-secondary hover:bg-bg-hover hover:text-text"
          aria-label={sidebarOpen ? 'Hide trace inspector' : 'Show trace inspector'}
        >
          {sidebarOpen ? 'Hide Trace' : 'Show Trace'}
        </button>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Main panel */}
        <main className="flex min-w-0 flex-1 flex-col">{main}</main>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="w-96 shrink-0 overflow-y-auto border-l border-border bg-bg-surface">
            {sidebar}
          </aside>
        )}
      </div>
    </div>
  );
}
