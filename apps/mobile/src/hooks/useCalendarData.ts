import { type CalendarData, type YearMonth } from '@delta/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { api } from '../api';

const AUTO_REFRESH_MS = 60_000;

interface State {
  data?: CalendarData;
  loading: boolean;
  refreshing: boolean;
  error?: string;
}

/**
 * Loads one month from /api/calendar.
 * TEMPORARY: replaced by CalendarVM (packages/core) in task 2; keep this hook logic-free.
 */
export function useCalendarData(month: YearMonth) {
  const [state, setState] = useState<State>({ loading: true, refreshing: false });
  const requestId = useRef(0);

  const load = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      const id = ++requestId.current;
      // 'silent' = background refresh: no spinner, and a failure keeps the data already on screen.
      if (mode !== 'silent') {
        setState((s) => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: undefined }));
      }
      try {
        const data = await api.getCalendar(month);
        if (id === requestId.current) setState({ data, loading: false, refreshing: false });
      } catch (e) {
        if (id !== requestId.current || mode === 'silent') return;
        const message = e instanceof Error ? e.message : 'Could not load calendar.';
        setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
      }
    },
    [month],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TEMPORARY load-on-mount; replaced by a ViewModel (TODO.md)
    void load('initial');
  }, [load]);

  // Keep the grid fresh while two editors change the same data: refetch quietly when the app
  // comes back to the foreground and every AUTO_REFRESH_MS while it is open.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void load('silent');
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void load('silent');
    }, AUTO_REFRESH_MS);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, [load]);

  // Never show another month's bookings on this month's grid.
  const data = state.data?.month === month ? state.data : undefined;

  return {
    data,
    loading: state.loading,
    refreshing: state.refreshing,
    error: state.error,
    reload: useCallback(() => load('initial'), [load]),
    refresh: useCallback(() => load('refresh'), [load]),
  };
}
