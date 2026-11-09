import type { ApiClient } from '../services/apiClient';
import type { RoleOption, UserSummary } from '../models/types';
import {
  EMPTY_USER_FORM,
  toCreateUserRequest,
  toUpdateUserRequest,
  userFormFromUser,
  validateUserField,
  type UserFormField,
  type UserFormValues,
} from '../models/userForm';
import { FormVM, type FieldRule, type FormDefinition } from './FormVM';

/** The user form: the fields the user types, and whether the account is active (a switch in edit mode). */
export type UserFormData = UserFormValues & { isActive: boolean };

const textField = (field: UserFormField, required: { create: boolean; edit: boolean }): FieldRule<UserFormData> => ({
  required,
  validate: (values, mode) => validateUserField(field, values, mode),
});

/** What the user form needs from the API client. */
export type UserFormApi = Pick<ApiClient, 'createUser' | 'updateUser'>;

export function userFormDefinition(api: UserFormApi, roles: readonly RoleOption[]): FormDefinition<UserFormData, UserSummary> {
  return {
    fields: {
      email: { ...textField('email', { create: true, edit: false }), editableInEdit: false }, // the username never changes
      firstName: textField('firstName', { create: true, edit: true }),
      lastName: textField('lastName', { create: true, edit: true }),
      phone: textField('phone', { create: false, edit: false }),
      roleId: textField('roleId', { create: true, edit: true }),
      password: { ...textField('password', { create: true, edit: false }), showInView: false }, // never shown
      isActive: { required: { create: false, edit: false }, showInCreate: false }, // a new user is always active
    },
    empty: { ...EMPTY_USER_FORM, isActive: true },
    fromSaved: (user) => ({ ...userFormFromUser(user, roles), isActive: user.isActive }),
    create: (values) => api.createUser(toCreateUserRequest(values)),
    update: async (values, _initial, saved) => {
      const request = toUpdateUserRequest(saved, roles, values, values.isActive);
      return request ? api.updateUser(request) : saved; // nothing changed: nothing to send
    },
  };
}

/**
 * The ViewModel of the user screens. Pass the user for the details/edit screen (it opens read-only), or nothing
 * for Add user. `canEdit` is whether the caller has can_edit_user (the Edit button).
 */
export function createUserFormVM(options: {
  api: UserFormApi;
  roles: readonly RoleOption[];
  user?: UserSummary;
  canEdit: boolean;
}): FormVM<UserFormData, UserSummary> {
  return new FormVM<UserFormData, UserSummary>({ definition: userFormDefinition(options.api, options.roles), saved: options.user, canEdit: options.canEdit });
}
