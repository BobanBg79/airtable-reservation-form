// Pure parts of scripts/create-admin.mjs, kept apart so they can be tested without a database.
import { passwordProblems } from '../api/_password.js';

// Same rules as the users table checks (db/schema.ts): lowercase, no spaces, one "@", a dot in the domain.
const EMAIL = /^[^@ ]+@[^@ ]+[.][^@ ]+$/;
const PHONE = /^[+]?[0-9]{6,15}$/;

/** Lowercase and trim an email, as it is stored. */
export function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

/** Returns { value, problems[] }. `value` has the normalized email and trimmed names. */
export function validateAdminInput({ email, firstName, lastName, phone, password }) {
  const problems = [];
  const value = {
    email: normalizeEmail(email),
    firstName: String(firstName ?? '').trim(),
    lastName: String(lastName ?? '').trim(),
    phone: String(phone ?? '').trim() || null,
  };
  if (!EMAIL.test(value.email)) problems.push('The email address is not valid.');
  if (!value.firstName) problems.push('The first name is required.');
  if (!value.lastName) problems.push('The last name is required.');
  if (value.phone && !PHONE.test(value.phone)) problems.push('The phone must be an optional "+" and 6 to 15 digits.');
  problems.push(...passwordProblems(password));
  return { value, problems };
}

/** Host of a postgres:// URL with the pooler suffix removed, or undefined. Never returns credentials. */
export function databaseHost(url) {
  const m = /@([^/:?]+)/.exec(url ?? '');
  return m ? m[1].replace('-pooler', '') : undefined;
}

/** True when both URLs point at the same Neon endpoint (pooled or not), so the owner string is for the dev branch too. */
export function sameDatabase(urlA, urlB) {
  const a = databaseHost(urlA);
  return !!a && a === databaseHost(urlB);
}
