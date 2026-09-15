import type { Window } from '../data/topItems';

/** Shared per-window palette, distinct from the bump chart's stalwart/newcomer/faded colors. */
export const WINDOW_COLOR: Record<Window, string> = {
  long_term: '#5b8ff9',
  medium_term: '#b075e5',
  short_term: '#e8618c',
};
