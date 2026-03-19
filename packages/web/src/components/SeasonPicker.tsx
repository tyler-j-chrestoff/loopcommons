'use client';

import { useEffect, useState } from 'react';

const SEASONS = [
  { id: 'spring', label: 'Spring', icon: '🌱' },
  { id: 'summer', label: 'Summer', icon: '☀️', disabled: true },
  { id: 'fall', label: 'Fall', icon: '🍂', disabled: true },
  { id: 'winter', label: 'Winter', icon: '❄️', disabled: true },
] as const;

type Season = (typeof SEASONS)[number]['id'];

function getStoredSeason(): Season {
  if (typeof window === 'undefined') return 'spring';
  return (localStorage.getItem('season') as Season) ?? 'spring';
}

function applySeason(season: Season) {
  document.documentElement.setAttribute('data-season', season);
  localStorage.setItem('season', season);
}

export function SeasonPicker() {
  const [season, setSeason] = useState<Season>('spring');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = getStoredSeason();
    setSeason(stored);
    applySeason(stored);
  }, []);

  function handleSelect(id: Season) {
    setSeason(id);
    applySeason(id);
    setOpen(false);
  }

  const current = SEASONS.find(s => s.id === season)!;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="rounded p-1 text-sm text-text-secondary hover:text-text transition-colors"
        aria-label={`Current season: ${current.label}`}
        title={`Season: ${current.label}`}
      >
        {current.icon}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 rounded-md border border-border bg-bg-surface shadow-lg z-50">
          {SEASONS.map(s => (
            <button
              key={s.id}
              onClick={() => 'disabled' in s && s.disabled ? undefined : handleSelect(s.id)}
              disabled={'disabled' in s && s.disabled}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-sm transition-colors first:rounded-t-md last:rounded-b-md ${
                s.id === season
                  ? 'bg-bg-hover text-text'
                  : 'disabled' in s && s.disabled
                    ? 'text-text-muted cursor-not-allowed'
                    : 'text-text-secondary hover:bg-bg-hover hover:text-text'
              }`}
              title={'disabled' in s && s.disabled ? 'Coming soon' : s.label}
            >
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
