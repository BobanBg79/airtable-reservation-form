import { type RolePermissions } from '@delta/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface State {
  data?: RolePermissions;
  loading: boolean;
  refreshing: boolean;
  error?: string;
}

/**
 * Loads every permission and the roles with what each has, from /api/roles/permissions.
 * TEMPORARY: becomes a ViewModel in packages/core, like useUsers; keep this hook logic-free.
 */
export function useRolePermissions() {
  const [state, setState] = useState<State>({ loading: true, refreshing: false });
  const requestId = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: undefined }));
    try {
      const data = await api.getRolePermissions();
      if (id === requestId.current) setState({ data, loading: false, refreshing: false });
    } catch (e) {
      if (id !== requestId.current) return;
      const message = e instanceof Error ? e.message : 'Could not load roles.';
      setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TEMPORARY load-on-mount; replaced by a ViewModel (TODO.md)
    void load('initial');
  }, [load]);

  const reload = useCallback(() => void load('initial'), [load]);
  const refresh = useCallback(() => void load('refresh'), [load]);
  return { ...state, reload, refresh };
}
