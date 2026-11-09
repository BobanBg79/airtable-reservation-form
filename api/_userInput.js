// Validation of the user forms on the server (the source of truth; packages/core has the same rules for the
// forms, and a test keeps the two in step). Pure functions: no database. Files starting with "_" in api/ are
// not routes. The password rules are in _password.js.
import { passwordProblems } from './_password.js';

export const MAX_EMAIL_LENGTH = 254;
export const MAX_NAME_LENGTH = 100;

// The same patterns as the CHECK constraints of the users table (db/schema.ts).
const EMAIL_PATTERN = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const PHONE_PATTERN = /^[+]?[0-9]{6,15}$/;
const ID_PATTERN = /^[1-9][0-9]{0,17}$/;

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** Email: trimmed and lowercased (it is the username). Returns { value } or { error }. */
export function checkEmail(raw) {
  const value = text(raw).toLowerCase();
  if (!value) return { error: 'Email is required.' };
  if (value.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(value)) return { error: 'Enter a valid email address.' };
  return { value };
}

function checkName(raw, label) {
  const value = text(raw);
  if (!value) return { error: `${label} is required.` };
  if (value.length > MAX_NAME_LENGTH) return { error: `${label} is too long (${MAX_NAME_LENGTH} characters at most).` };
  return { value };
}

/** Phone is optional: empty means none (null). */
function checkPhone(raw) {
  if (raw === undefined || raw === null) return { value: null };
  const value = text(raw);
  if (!value) return { value: null };
  if (!PHONE_PATTERN.test(value)) return { error: 'Enter 6 to 15 digits, optionally starting with +, and no spaces.' };
  return { value };
}

function checkRoleId(raw) {
  const value = typeof raw === 'number' && Number.isInteger(raw) ? String(raw) : text(raw);
  return ID_PATTERN.test(value) ? { value } : { error: 'Role is required.' };
}

function checkPassword(raw) {
  const problems = passwordProblems(raw);
  return problems.length ? { error: problems.join(' ') } : { value: raw };
}

/**
 * The body of POST /api/users/create. Returns { value, fields }: `fields` maps a field name to its message
 * (empty when everything is fine), `value` is the cleaned input when it is.
 */
export function validateNewUser(body) {
  const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const checks = {
    email: checkEmail(input.email),
    firstName: checkName(input.firstName, 'First name'),
    lastName: checkName(input.lastName, 'Last name'),
    phone: checkPhone(input.phone),
    roleId: checkRoleId(input.roleId),
    password: checkPassword(input.password),
  };
  const fields = {};
  for (const [name, c] of Object.entries(checks)) if (c.error) fields[name] = c.error;
  if (Object.keys(fields).length) return { fields };
  return {
    fields,
    value: Object.fromEntries(Object.entries(checks).map(([name, c]) => [name, c.value])),
  };
}
