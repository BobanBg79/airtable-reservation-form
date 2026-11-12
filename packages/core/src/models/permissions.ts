// The one place where roles and permissions are defined in code (ADR 0007).
// The reference-data migration inserts exactly these names, and a test (scripts/permissions.test.mjs)
// fails if the database or that migration differs from this list.
//
// Names: can_<action>_<entity> or can_<action>_<entity>_<sub_entity>. Actions are only view, create
// and edit; cancelling and deactivating are status changes, so they are edit. There is no delete.

export const ROLES = ['admin', 'business_owner', 'manager', 'cleaning_lady', 'handyman'] as const;
export type RoleName = (typeof ROLES)[number];

export const PERMISSIONS = [
  'can_view_apartment',
  'can_create_apartment',
  'can_edit_apartment',
  'can_view_reservation',
  'can_create_reservation',
  'can_edit_reservation',
  // guest and cleaning have no table yet; the permissions exist so the roles are ready for them.
  'can_view_guest',
  'can_create_guest',
  'can_edit_guest',
  'can_view_cleaning',
  'can_create_cleaning',
  'can_edit_cleaning',
  'can_view_user',
  'can_create_user',
  'can_edit_user',
  // The Manage roles screen: which permissions each role has. Roles are not created or removed here, so no create.
  'can_view_role',
  'can_edit_role',
  // Sub-entities have no create: they are created together with their entity.
  'can_view_apartment_owner_contact',
  'can_edit_apartment_owner_contact',
  'can_view_apartment_rent',
  'can_edit_apartment_rent',
] as const;
export type PermissionName = (typeof PERMISSIONS)[number];

// Only the admin manages users and roles (ADR 0007), so the other roles start without these.
export const ADMIN_ONLY_PERMISSIONS: readonly PermissionName[] = ['can_view_user', 'can_create_user', 'can_edit_user', 'can_view_role', 'can_edit_role'];
const withoutAdminOnlyPermissions = PERMISSIONS.filter((p) => !ADMIN_ONLY_PERMISSIONS.includes(p));

/** Initial permissions of each role, as seeded by the migration. Admin can change the others afterwards. */
export const INITIAL_ROLE_PERMISSIONS: Record<RoleName, readonly PermissionName[]> = {
  admin: PERMISSIONS,
  business_owner: withoutAdminOnlyPermissions,
  manager: withoutAdminOnlyPermissions,
  cleaning_lady: [],
  handyman: [],
};

/** True if `granted` (the permission names of the signed-in user) contains `permission`. */
export function can(granted: readonly string[] | null | undefined, permission: PermissionName): boolean {
  return !!granted && granted.includes(permission);
}

/**
 * The permission each screen needs. The tab bar, the Home shortcuts and the screens themselves read this, so
 * a hidden screen reached by a stale route or a link shows "No access". This is for the user experience only:
 * the server guard is what protects the data.
 */
export const SCREEN_PERMISSIONS = {
  calendar: 'can_view_reservation',
  apartments: 'can_view_apartment',
  users: 'can_view_user',
  roles: 'can_view_role',
} as const satisfies Record<string, PermissionName>;
export type ScreenName = keyof typeof SCREEN_PERMISSIONS;

export function canOpenScreen(granted: readonly string[] | null | undefined, screen: ScreenName): boolean {
  return can(granted, SCREEN_PERMISSIONS[screen]);
}
