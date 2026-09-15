import type { Window } from '../data/topItems';

/** Per-window palette: green/white/orange, consistent with the bump chart's category colors
 *  and the app's Spotify-report branding. */
export const WINDOW_COLOR: Record<Window, string> = {
  long_term: '#ffffff',
  medium_term: '#ff9f1c',
  short_term: '#1ed760',
};
