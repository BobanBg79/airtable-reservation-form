// Validation and rules of the Manage roles routes. Pure functions: no database. Files starting with "_" in
// api/ are not routes.

// Only the admin manages users and roles (ADR 0007, a hard rule): these permissions can never be given to
// any other role. packages/core has the same list (ADMIN_ONLY_PERMISSIONS); scripts/user-rules-parity.test.mjs
// keeps the two in step, because api/ cannot import packages/core.
export const ADMIN_ONLY_PERMISSIONS = ['can_view_user', 'can_create_user', 'can_edit_user', 'can_view_role', 'can_edit_role'];

const ID_PATTERN = /^[1-9][0-9]{0,17}$/;
const PERMISSION_PATTERN = /^can_(view|create|edit)_[a-z]+(_[a-z]+)*$/;
const MAX_PERMISSIONS = 100;

/**
 * The body of POST /api/roles/edit: { id, permissions }, where `permissions` is the COMPLETE new set of
 * permission names of the role. Returns { value, fields }: `fields` maps a field to its message (empty when
 * everything is fine), `value` is { id, permissions } (no duplicates) when it is.
 */
export function validateRoleEdit(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const fields = {};

  const id = typeof input.id === 'number' && Number.isInteger(input.id) ? String(input.id) : typeof input.id === 'string' ? input.id.trim() : '';
  if (!ID_PATTERN.test(id)) fields.id = 'Invalid role id.';

  let permissions = [];
  if (!Array.isArray(input.permissions) || input.permissions.length > MAX_PERMISSIONS) {
    fields.permissions = 'Send the permissions of the role as a list of names.';
  } else if (!input.permissions.every((p) => typeof p === 'string' && PERMISSION_PATTERN.test(p))) {
    fields.permissions = 'Every permission must be a name like can_view_user.';
  } else {
    permissions = [...new Set(input.permissions)];
  }

  if (Object.keys(fields).length) return { fields };
  return { fields, value: { id, permissions } };
}

/** The admin-only permissions among `names`. */
export function adminOnlyAmong(names) {
  return names.filter((name) => ADMIN_ONLY_PERMISSIONS.includes(name));
}
