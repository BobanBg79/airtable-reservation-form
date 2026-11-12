import { createRoleFormVM, type FormVM, type RoleFormData, type RoleWithPermissions } from '@delta/core';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../state/AuthProvider';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; form: FormVM<RoleFormData, RoleWithPermissions>; permissionNames: string[] };

/**
 * Loads the permissions and the role with this id, and creates its FormVM (read-only; Edit for someone who has
 * can_edit_role, never for the admin role).
 * TEMPORARY: becomes part of a ViewModel in packages/core (TODO.md, "ViewModels"); keep this hook logic-free.
 */
export function useRoleForm(id: string) {
  const { can } = useAuth();
  const canEdit = can('can_edit_role');
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- TEMPORARY load-on-mount; replaced by a ViewModel (TODO.md)
    setState({ status: 'loading' });
    api
      .getRolePermissions()
      .then(({ permissions, roles }) => {
        if (cancelled) return;
        const role = roles.find((r) => r.id === id);
        if (!role) setState({ status: 'error', message: 'This role could not be found.' });
        else setState({ status: 'ready', permissionNames: permissions, form: createRoleFormVM({ api, permissionNames: permissions, role, canEdit }) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ status: 'error', message: e instanceof Error ? e.message : 'Could not load the role.' });
      });
    return () => {
      cancelled = true;
    };
  }, [id, canEdit, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, reload };
}
