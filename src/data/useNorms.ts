import { useEffect, useState } from 'react';
import type { Norms } from '../sensory/score';

export function useNorms(): { norms: Norms | null; error: string | null } {
  const [norms, setNorms] = useState<Norms | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/norms.json')
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load norms.json: ${r.status}`);
        return r.json() as Promise<Norms>;
      })
      .then(setNorms)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return { norms, error };
}
