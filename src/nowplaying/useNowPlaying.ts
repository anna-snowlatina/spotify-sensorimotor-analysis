import { useEffect, useRef, useState } from 'react';
import { fetchNowPlaying, type NowPlaying } from './api';
import { NowPlayingPoller, type RequestLogEntry } from './poller';

export type DebugStats = {
  requestsThisSession: number;
  requestsLastHour: number;
  lastStatus: 'ok' | 'error' | null;
  nextPollAt: number | null;
};

export type UseNowPlayingResult = {
  nowPlaying: NowPlaying;
  quotaPaused: boolean;
  debug: DebugStats;
};

const ONE_HOUR_MS = 60 * 60 * 1000;

export function useNowPlaying(): UseNowPlayingResult {
  const [nowPlaying, setNowPlaying] = useState<NowPlaying>({ state: 'idle' });
  const [quotaPaused, setQuotaPaused] = useState(false);
  const [debug, setDebug] = useState<DebugStats>({
    requestsThisSession: 0,
    requestsLastHour: 0,
    lastStatus: null,
    nextPollAt: null,
  });
  const requestLog = useRef<RequestLogEntry[]>([]);

  useEffect(() => {
    const poller = new NowPlayingPoller(fetchNowPlaying, {
      onUpdate: setNowPlaying,
      onQuotaExceeded: () => setQuotaPaused(true),
      onRequestLogged: (entry) => {
        requestLog.current.push(entry);
        setQuotaPaused(false);
        const cutoff = Date.now() - ONE_HOUR_MS;
        const recent = requestLog.current.filter((e) => e.timestamp >= cutoff);
        requestLog.current = recent;
        setDebug((d) => ({
          ...d,
          requestsThisSession: d.requestsThisSession + 1,
          requestsLastHour: recent.length,
          lastStatus: entry.status,
        }));
      },
      onScheduled: (nextPollAt) => setDebug((d) => ({ ...d, nextPollAt })),
    });

    poller.start();
    return () => poller.stop();
  }, []);

  return { nowPlaying, quotaPaused, debug };
}
