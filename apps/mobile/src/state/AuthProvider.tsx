import { ApiError, canOpenScreen, can, type AuthSession, type PermissionName, type ScreenName } from '@delta/core';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api, setUnauthorizedHandler } from '../api';
import { clearToken, loadToken, saveToken } from '../session';

type Status =
  | 'loading' // reading the saved token and asking the server who it belongs to
  | 'offline' // there is a token but the server could not be reached: keep it and offer a retry
  | 'signedOut'
  | 'signedIn';

interface State {
  status: Status;
  session?: AuthSession;
  /** Shown on the "offline" screen. */
  message?: string;
}

interface AuthValue {
  status: Status;
  session?: AuthSession;
  message?: string;
  /** Resolves to an error message to show on the login screen, or null when signed in. */
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Try again after "offline". */
  retry: () => void;
  can: (permission: PermissionName) => boolean;
  canOpen: (screen: ScreenName) => boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Keeps the session: the token in SecureStore, and who the user is and what they may do, from the server.
 * On start it asks GET /api/auth/me, so permissions changed by the admin apply at once. A 401 anywhere
 * (session ended, user deactivated) signs the user out and the login screen takes over.
 * TEMPORARY: becomes AuthVM in packages/core (TODO.md, "ViewModels"); keep this component logic-free.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const checking = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;

  const endSession = useCallback(async () => {
    await clearToken();
    setState({ status: 'signedOut' });
  }, []);

  /** Asks the server who the saved token belongs to. */
  const check = useCallback(async () => {
    const id = ++checking.current;
    const token = await loadToken();
    if (!token) {
      if (id === checking.current) setState({ status: 'signedOut' });
      return;
    }
    try {
      const session = await api.getMe();
      if (id === checking.current) setState({ status: 'signedIn', session });
    } catch (e) {
      if (id !== checking.current) return;
      if (e instanceof ApiError && e.status === 401) await endSession();
      else setState({ status: 'offline', message: e instanceof Error ? e.message : 'Could not reach the server.' });
    }
  }, [endSession]);

  useEffect(() => {
    void check();
  }, [check]);

  // The server says the session is over: forget it and show the login screen.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      checking.current++;
      void endSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [endSession]);

  // Back in the foreground: refresh the permissions quietly (this also keeps the session alive). A failure
  // changes nothing; a 401 is handled above.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || stateRef.current.status !== 'signedIn') return;
      void api
        .getMe()
        .then((session) => setState((s) => (s.status === 'signedIn' ? { status: 'signedIn', session } : s)))
        .catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { token, ...session } = await api.login(email, password);
      await saveToken(token);
      checking.current++;
      setState({ status: 'signedIn', session });
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'Could not sign in.';
    }
  }, []);

  const signOut = useCallback(async () => {
    checking.current++;
    try {
      await api.logout(); // ends it on the server too; if that fails the token is gone from this phone anyway
    } catch {
      /* ignore */
    }
    await endSession();
  }, [endSession]);

  const value = useMemo<AuthValue>(() => {
    const permissions = state.session?.permissions;
    return {
      status: state.status,
      session: state.session,
      message: state.message,
      signIn,
      signOut,
      retry: () => {
        setState({ status: 'loading' });
        void check();
      },
      can: (permission) => can(permissions, permission),
      canOpen: (screen) => canOpenScreen(permissions, screen),
    };
  }, [state, signIn, signOut, check]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
