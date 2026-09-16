import { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { handleCallback, consumeReturnTo } from './auth/pkce';
import LandingPage from './pages/LandingPage';

const ReportPage = lazy(() => import('./pages/ReportPage'));

function CallbackScreen() {
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    handleCallback(new URLSearchParams(window.location.search))
      .then(() => {
        navigate(consumeReturnTo(), { replace: true });
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
          <button type="button" onClick={() => navigate('/')}>
            Back to start
          </button>
        </>
      )}
    </main>
  );
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="/report"
        element={
          <Suspense fallback={<p style={{ padding: 24 }}>Loading report…</p>}>
            <ReportPage />
          </Suspense>
        }
      />
      <Route path="/callback" element={<CallbackScreen />} />
    </Routes>
  );
}

export default App;
