import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const IDLE_TIMEOUT_MS = 3000;

function toggleFullscreen(): void {
  if (document.fullscreenElement) {
    void document.exitFullscreen();
  } else {
    void document.documentElement.requestFullscreen();
  }
}

/**
 * Wraps the landing page's foreground UI: fades it out after 3s of no mouse/keyboard activity
 * (fading back in on activity) and hides the cursor while hidden. Also owns the ambient-mode
 * keyboard shortcuts: R opens the report, F toggles fullscreen, Esc exits fullscreen.
 */
export function AmbientChrome({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // Deliberately runs once (empty deps): re-running this effect on every parent re-render
  // (which happens on every now-playing poll) would reset the idle timer each time, making the
  // whole UI flicker in and out on the poll cadence instead of only on real user activity.
  useEffect(() => {
    function resetTimer() {
      setVisible(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setVisible(false), IDLE_TIMEOUT_MS);
    }

    function onKeyDown(e: KeyboardEvent) {
      resetTimer();
      if (e.key === 'r' || e.key === 'R') navigateRef.current('/report');
      else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      else if (e.key === 'Escape' && document.fullscreenElement) void document.exitFullscreen();
    }

    window.addEventListener('mousemove', resetTimer);
    window.addEventListener('mousedown', resetTimer);
    window.addEventListener('keydown', onKeyDown);
    resetTimer();

    return () => {
      window.removeEventListener('mousemove', resetTimer);
      window.removeEventListener('mousedown', resetTimer);
      window.removeEventListener('keydown', onKeyDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    document.body.style.cursor = visible ? '' : 'none';
    return () => {
      document.body.style.cursor = '';
    };
  }, [visible]);

  return (
    <div style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.4s ease' }}>{children}</div>
  );
}
