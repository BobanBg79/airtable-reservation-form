import { createApiClient, type CalendarData, type YearMonth } from '@delta/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../config';

const api = createApiClient({ baseUrl: API_BASE_URL });

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
    async (mode: 'initial' | 'refresh') => {
      const id = ++requestId.current;
      setState((s) => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: undefined }));
      try {
        const data = await api.getCalendar(month);
        if (id === requestId.current) setState({ data, loading: false, refreshing: false });
      } catch (e) {
        if (id !== requestId.current) return;
        const message = e instanceof Error ? e.message : 'Could not load calendar.';
        setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
      }
    },
    [month],
  );

  useEffect(() => {
    void load('initial');
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
