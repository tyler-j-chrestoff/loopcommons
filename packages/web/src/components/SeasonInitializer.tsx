'use client';

import { useEffect } from 'react';

export function SeasonInitializer() {
  useEffect(() => {
    const stored = localStorage.getItem('season');
    if (stored) {
      document.documentElement.setAttribute('data-season', stored);
    }
  }, []);

  return null;
}
