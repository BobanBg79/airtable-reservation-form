import type { PermissionName } from './permissions';

// The Manage roles screen: how the permission names are grouped and worded. Pure TypeScript.

/** One permission as shown in a group: "View", "Create" or "Edit" of its entity. */
export interface PermissionItem {
  /** The full name, e.g. "can_view_apartment". */
  name: string;
  /** "View", "Create" or "Edit". */
  label: string;
}

/** The permissions of one entity, e.g. "Apartments": view, create, edit. */
export interface PermissionGroup {
  /** The entity part of the name, e.g. "apartment" or "apartment_owner_contact". */
  entity: string;
  /** "Apartment", "Apartment owner contact". */
  title: string;
  items: PermissionItem[];
}

const ACTION_LABELS: Record<string, string> = { view: 'View', create: 'Create', edit: 'Edit' };

/** Splits "can_view_apartment_owner_contact" into its action and entity; undefined when it is not a permission name. */
export function parsePermission(name: string): { action: string; entity: string } | undefined {
  const m = /^can_(view|create|edit)_([a-z]+(?:_[a-z]+)*)$/.exec(name);
  return m ? { action: m[1]!, entity: m[2]! } : undefined;
}

/** "apartment_owner_contact" becomes "Apartment owner contact". */
export function entityTitle(entity: string): string {
  const text = entity.replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Groups permission names by entity, in the order the entities first appear and with the actions in the order
 * given. A name that is not a permission name is left out.
 */
export function groupPermissions(names: readonly (PermissionName | string)[]): PermissionGroup[] {
  const groups: PermissionGroup[] = [];
  for (const name of names) {
    const parsed = parsePermission(name);
    if (!parsed) continue;
    let group = groups.find((g) => g.entity === parsed.entity);
    if (!group) {
      group = { entity: parsed.entity, title: entityTitle(parsed.entity), items: [] };
      groups.push(group);
    }
    group.items.push({ name, label: ACTION_LABELS[parsed.action] ?? parsed.action });
  }
  return groups;
}
