import { useEffect, useMemo, useState } from 'react';
import { login, handleCallback, isLoggedIn, logout, getStoredTokens } from './auth/pkce';
import { loadTopData, CACHE_KEY, WINDOWS, type TopData, type Window } from './data/topItems';
import { cacheAgeMs } from './data/cache';
import { useNorms } from './data/useNorms';
import { loadSnapshots } from './data/snapshots';
import { BumpChart, type BumpColumn } from './components/BumpChart';
import { TopFiveSummary } from './components/TopFiveSummary';
import { TitleMatchDebug } from './components/TitleMatchDebug';
import { SensoryPanel } from './components/SensoryPanel';
import { SensoryScatter } from './components/SensoryScatter';
import { DriftStat } from './components/DriftStat';
import spotifyLogo from './assets/spotify-logo.svg';

const WINDOW_LABELS: Record<Window, string> = {
  long_term: 'Long term (~1 year)',
  medium_term: 'Medium term (~6 months)',
  short_term: 'Short term (~4 weeks)',
};

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ready'; data: TopData }
  | { kind: 'error'; message: string };

function formatAge(ms: number | null): string {
  if (ms === null) return 'no cache';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function CallbackScreen() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    handleCallback(new URLSearchParams(window.location.search))
      .then(() => {
        window.location.assign('/');
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  return (
    <main className="card" style={{ margin: 32 }}>
      <h1>Signing in…</h1>
      {error && (
        <>
          <p className="error">{error}</p>
          <button type="button" onClick={() => window.location.assign('/')}>
            Back to start
          </button>
        </>
      )}
    </main>
  );
}

function TopDataView() {
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [cacheAge, setCacheAge] = useState<number | null>(null);
  const { norms, error: normsError } = useNorms();
  const [includeSnapshots, setIncludeSnapshots] = useState(false);
  const [revealedRefreshToken, setRevealedRefreshToken] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  async function load(forceRefresh: boolean) {
    setStatus({ kind: 'loading' });
    try {
      const data = await loadTopData(forceRefresh);
      setStatus({ kind: 'ready', data });
      setCacheAge(cacheAgeMs(CACHE_KEY));
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  }

  useEffect(() => {
    void load(false);
  }, []);

  function forceExpiredAccessToken() {
    const tokens = getStoredTokens();
    if (!tokens) return;
    localStorage.setItem(
      'taste-drift:tokens',
      JSON.stringify({ ...tokens, accessToken: 'invalid-token-for-testing' }),
    );
  }

  function toggleRevealRefreshToken() {
    setCopyStatus(null);
    if (revealedRefreshToken) {
      setRevealedRefreshToken(null);
      return;
    }
    const tokens = getStoredTokens();
    setRevealedRefreshToken(tokens?.refreshToken ?? null);
  }

  const data = status.kind === 'ready' ? status.data : null;
  const bumpColumns = useMemo<BumpColumn[] | null>(() => {
    if (!data) return null;
    const base: BumpColumn[] = WINDOWS.map((w) => ({
      key: w,
      label: WINDOW_LABELS[w],
      artists: data[w].artists,
      tracks: data[w].tracks,
    }));
    if (!includeSnapshots) return base;
    const snapshotColumns: BumpColumn[] = loadSnapshots().map((s) => ({
      key: `snapshot:${s.date}`,
      label: s.date,
      artists: s.artists,
      tracks: s.tracks,
    }));
    return [...base, ...snapshotColumns];
  }, [data, includeSnapshots]);

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <img src={spotifyLogo} alt="" className="logo" />
          <h1 style={{ margin: 0 }}>Taste Drift & Sensorimotor Map</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={() => {
              forceExpiredAccessToken();
              void load(true);
            }}
            style={{ fontSize: 11, padding: '4px 10px' }}
          >
            Debug: force 401
          </button>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      <p style={{ fontSize: 11, opacity: 0.5, margin: '4px 0 16px' }}>
        Cache: {formatAge(cacheAge)} (6h TTL)
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <button type="button" className="primary" onClick={() => void load(true)}>
          Refresh data
        </button>
        <button type="button" onClick={toggleRevealRefreshToken}>
          {revealedRefreshToken ? 'Hide' : 'Debug: reveal'} refresh token
        </button>
      </div>

      {revealedRefreshToken && (
        <div className="card" style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13 }}>
            For <code>scripts/snapshot.mjs</code>: add this to <code>.env.local</code> as{' '}
            <code>SPOTIFY_REFRESH_TOKEN=...</code>. Treat it like a password (scope is limited to{' '}
            <code>user-top-read</code>) — never commit it.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <pre style={{ margin: 0, flex: '1 1 auto', overflowWrap: 'anywhere' }}>{revealedRefreshToken}</pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard
                  .writeText(revealedRefreshToken)
                  .then(() => setCopyStatus('Copied!'))
                  .catch(() => setCopyStatus('Copy failed — select the text manually.'));
              }}
            >
              Copy
            </button>
          </div>
          {copyStatus && <p style={{ fontSize: 12, color: 'var(--text)' }}>{copyStatus}</p>}
        </div>
      )}

      {status.kind === 'loading' && <p>Loading top artists and tracks…</p>}
      {status.kind === 'error' && <p className="error">Error: {status.message}</p>}
      {status.kind === 'ready' && bumpColumns && (
        <>
          <TopFiveSummary data={status.data} />

          <div style={{ marginTop: 16 }}>
            <label style={{ fontSize: 13, display: 'block', marginBottom: 8 }}>
              <input
                type="checkbox"
                checked={includeSnapshots}
                onChange={(e) => setIncludeSnapshots(e.target.checked)}
              />{' '}
              Include saved snapshots as additional bump chart columns ({loadSnapshots().length} saved)
            </label>
            <BumpChart
              columns={bumpColumns}
              caption="Windows overlap: long_term includes the last several months of listening, so the three live columns are not independent periods. Snapshot columns (if shown) are independent single-day captures."
            />
          </div>

          {normsError && <p className="error">Error loading norms: {normsError}</p>}
          {!normsError && !norms && <p>Loading sensory norms…</p>}
          {norms && (
            <>
              <SensoryPanel data={status.data} norms={norms} />
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16 }}>
                <SensoryScatter data={status.data} norms={norms} />
                <DriftStat data={status.data} norms={norms} />
              </div>
              <TitleMatchDebug data={status.data} norms={norms} />
            </>
          )}

          <details style={{ marginTop: 16 }}>
            <summary>Normalized TopData (JSON)</summary>
            <pre>{JSON.stringify(status.data, null, 2)}</pre>
          </details>
        </>
      )}
    </main>
  );
}

function LoginScreen() {
  const [error, setError] = useState<string | null>(null);
  return (
    <main
      style={{
        minHeight: '100svh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        textAlign: 'center',
        padding: 24,
      }}
    >
      <img src={spotifyLogo} alt="" style={{ height: 64, width: 'auto' }} />
      <h1 style={{ margin: 0 }}>Taste Drift & Sensorimotor Map</h1>
      <p>See how your Spotify taste is shifting.</p>
      <button
        type="button"
        className="primary"
        onClick={() => {
          login().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
        }}
      >
        Log in with Spotify
      </button>
      {error && <p className="error">{error}</p>}
    </main>
  );
}

function App() {
  if (window.location.pathname === '/callback') {
    return <CallbackScreen />;
  }
  return isLoggedIn() ? <TopDataView /> : <LoginScreen />;
}

export default App;
