import { createUserFormVM, type FormVM, type RoleOption, type UserFormData, type UserSummary } from '@delta/core';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../state/AuthProvider';

type Form = FormVM<UserFormData, UserSummary>;

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; form: Form; roles: RoleOption[] };

/**
 * Loads what the user form needs (the roles, and the user when there is an id) and creates its FormVM.
 * No id is Add user; an id opens that user read-only, with Edit for someone who has can_edit_user.
 * TEMPORARY: becomes part of a ViewModel in packages/core (TODO.md, "ViewModels"); keep this hook logic-free.
 */
export function useUserForm(id?: string) {
  const { can } = useAuth();
  const canEdit = can('can_edit_user');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TEMPORARY load-on-mount; replaced by a ViewModel (TODO.md)
    setState({ status: 'loading' });
    Promise.all([api.getRoles(), id ? api.getUser(id) : Promise.resolve(undefined)])
      .then(([roles, user]) => {
        if (!cancelled) setState({ status: 'ready', roles, form: createUserFormVM({ api, roles, user, canEdit }) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not load the form.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, canEdit, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
