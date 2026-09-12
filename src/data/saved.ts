import { useSyncExternalStore } from 'react';

// Saved competitions are a per-browser convenience in this prototype: no account,
// no server. Every localStorage call is guarded because private windows and
// blocked site data make the accessor itself throw.
const KEY = 'championways:saved';
const empty: string[] = [];

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed.filter((slug): slug is string => typeof slug === 'string') : empty;
  } catch {
    return empty;
  }
}

let slugs = read();
const listeners = new Set<() => void>();

function publish() {
  try {
    localStorage.setItem(KEY, JSON.stringify(slugs));
  } catch {
    // A viewer who blocks site data still gets the toggle for this session.
  }
  for (const listener of listeners) listener();
}

export function toggleSaved(slug: string) {
  slugs = slugs.includes(slug) ? slugs.filter((saved) => saved !== slug) : [...slugs, slug];
  publish();
}

export function useSavedSlugs() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => slugs,
    () => empty,
  );
}
