import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from './api.js';

type State<T> = { data: T | null; error: string | null; details: unknown; loading: boolean };

export function useApi<T>(path: string | null, options: { pollMs?: number } = {}) {
  const [state, setState] = useState<State<T>>({
    data: null,
    error: null,
    details: null,
    loading: Boolean(path),
  });
  const [tick, setTick] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setState({ data: null, error: null, details: null, loading: false });
      return;
    }
    let alive = true;
    setState((current) => ({ ...current, loading: true, error: null }));
    api
      .get<T>(path)
      .then((data) => {
        if (alive) setState({ data, error: null, details: null, loading: false });
      })
      .catch((error: ApiError) => {
        if (alive) {
          setState({
            data: null,
            error: error.message,
            details: error.details ?? null,
            loading: false,
          });
        }
      });
    return () => {
      alive = false;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!options.pollMs || !path) return;
    const timer = setInterval(() => setTick((current) => current + 1), options.pollMs);
    return () => clearInterval(timer);
  }, [options.pollMs, path]);

  const reload = useCallback(() => setTick((current) => current + 1), []);
  return { ...state, reload };
}
