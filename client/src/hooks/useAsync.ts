import { useEffect, useState } from 'react';

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Run an async loader on mount / when deps change, tracking loading + error and
 * ignoring results from stale/cancelled runs.
 */
export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> & { setData: (d: T) => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setState(s => ({ ...s, loading: true, error: null }));
      try {
        const data = await loader();
        if (!cancelled) setState({ data, loading: false, error: null });
      } catch (err) {
        if (!cancelled) setState({ data: null, loading: false, error: err instanceof Error ? err.message : 'Failed to load' });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, setData: (data: T) => setState(s => ({ ...s, data })) };
}
