import { ADMIN_ONLY_PERMISSIONS } from '../models/permissions';
import type { RoleWithPermissions } from '../models/types';
import type { ApiClient } from '../services/apiClient';
import { FormVM, type FieldRule, type FormDefinition } from './FormVM';

/** The role form: one on/off switch per permission, keyed by the permission name. */
export type RoleFormData = { [permission: string]: boolean };

/** What the role form needs from the API client. */
export type RoleFormApi = Pick<ApiClient, 'updateRole'>;

export function roleFormDefinition(api: RoleFormApi, permissionNames: readonly string[]): FormDefinition<RoleFormData, RoleWithPermissions> {
  const fields: { [permission: string]: FieldRule<RoleFormData> } = {};
  for (const name of permissionNames) {
    // The users and roles permissions are the admin's alone (ADR 0007): another role's switch for them is locked.
    fields[name] = { required: { create: false, edit: false }, editableInEdit: !(ADMIN_ONLY_PERMISSIONS as readonly string[]).includes(name) };
  }
  const withValue = (has: (name: string) => boolean): RoleFormData => Object.fromEntries(permissionNames.map((name) => [name, has(name)]));
  return {
    fields,
    empty: withValue(() => false),
    fromSaved: (role) => withValue((name) => role.permissions.includes(name)),
    create: () => Promise.reject(new Error('Roles are not created here.')),
    update: (values, _initial, saved) => api.updateRole({ id: saved.id, permissions: permissionNames.filter((name) => values[name] === true) }),
  };
}

/**
 * The ViewModel of one role's screen: its permissions read-only, with Edit for someone who has can_edit_role. The
 * admin role (protected) never gets Edit: nobody changes its permissions.
 */
export function createRoleFormVM(options: {
  api: RoleFormApi;
  permissionNames: readonly string[];
  role: RoleWithPermissions;
  canEdit: boolean;
}): FormVM<RoleFormData, RoleWithPermissions> {
  return new FormVM<RoleFormData, RoleWithPermissions>({
    definition: roleFormDefinition(options.api, options.permissionNames),
    saved: options.role,
    canEdit: options.canEdit && !options.role.isProtected,
  });
}
