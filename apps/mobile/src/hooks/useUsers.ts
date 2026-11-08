import { type UserSummary } from '@delta/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface State {
  users?: UserSummary[];
  loading: boolean;
  refreshing: boolean;
  error?: string;
}

/**
 * Loads the users from /api/users.
 * TEMPORARY: becomes a ViewModel in packages/core, like useCalendarData; keep this hook logic-free.
 */
export function useUsers() {
  const [state, setState] = useState<State>({ loading: true, refreshing: false });
  const requestId = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: undefined }));
    try {
      const users = await api.getUsers();
      if (id === requestId.current) setState({ users, loading: false, refreshing: false });
    } catch (e) {
      if (id !== requestId.current) return;
      const message = e instanceof Error ? e.message : 'Could not load users.';
      setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TEMPORARY load-on-mount; replaced by a ViewModel (TODO.md)
    void load('initial');
  }, [load]);

  return {
    ...state,
    reload: () => void load('initial'),
    refresh: () => void load('refresh'),
  };
}
