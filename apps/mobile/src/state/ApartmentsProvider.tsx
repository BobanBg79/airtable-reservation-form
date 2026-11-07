import { apartmentHues, findApartment, type ApartmentDetails } from '@delta/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api';

interface State {
  apartments?: ApartmentDetails[];
  loading: boolean;
  refreshing: boolean;
  error?: string;
}

interface ApartmentsValue extends State {
  /** Try again after an error. */
  reload: () => void;
  /** Pull-to-refresh: keeps the list on screen while it loads. */
  refresh: () => void;
  byId: (id: string) => ApartmentDetails | undefined;
  /** Stable colour hue for an apartment, the same one the calendar bars use. */
  hueOf: (name: string) => number;
}

const ApartmentsContext = createContext<ApartmentsValue | null>(null);

/**
 * Loads the apartments once for the whole app, so the list, the details and the calendar's
 * "tap a name" all read the same data.
 * TEMPORARY: replaced by a ViewModel in packages/core, like useCalendarData.
 */
export function ApartmentsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ loading: true, refreshing: false });
  const requestId = useRef(0);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++requestId.current;
    setState((s) => ({ ...s, loading: mode === 'initial', refreshing: mode === 'refresh', error: undefined }));
    try {
      const apartments = await api.getApartments();
      if (id === requestId.current) setState({ apartments, loading: false, refreshing: false });
    } catch (e) {
      if (id !== requestId.current) return;
      const message = e instanceof Error ? e.message : 'Could not load apartments.';
      setState((s) => ({ ...s, loading: false, refreshing: false, error: message }));
    }
  }, []);

  useEffect(() => {
    void load('initial');
  }, [load]);

  const value = useMemo<ApartmentsValue>(() => {
    const hues = apartmentHues((state.apartments ?? []).map((a) => a.name));
    return {
      ...state,
      reload: () => void load('initial'),
      refresh: () => void load('refresh'),
      byId: (id) => (state.apartments ? findApartment(state.apartments, id) : undefined),
      hueOf: (name) => hues.get(name) ?? 0,
    };
  }, [state, load]);

  return <ApartmentsContext.Provider value={value}>{children}</ApartmentsContext.Provider>;
}

export function useApartments(): ApartmentsValue {
  const value = useContext(ApartmentsContext);
  if (!value) throw new Error('useApartments must be used inside <ApartmentsProvider>.');
  return value;
}
