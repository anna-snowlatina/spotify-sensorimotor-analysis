import type { RankedItem } from './topItems';

export type Snapshot = {
  date: string; // YYYY-MM-DD
  artists: RankedItem[];
  tracks: RankedItem[];
};

// Bundled at build time; re-run `npm run dev`/`npm run build` after adding a new snapshot file.
const modules = import.meta.glob('../../data/snapshots/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, Snapshot>;

/** All saved snapshots, sorted oldest first. */
export function loadSnapshots(): Snapshot[] {
  return Object.values(modules).sort((a, b) => a.date.localeCompare(b.date));
}
