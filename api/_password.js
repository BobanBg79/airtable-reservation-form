// Password hashing (ADR 0007): bcrypt, a slow salted hash. The hash is checked only on the server
// and is never returned to any client. Files starting with "_" in api/ are not exposed as routes.
import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes, so refuse longer ones
const COST = 12;

/**
 * Problems with a plain password, as short messages (empty array = acceptable). The rules (owner, 2026-11-09):
 * at least 10 characters with an uppercase letter, a lowercase letter, a digit and a special character (anything
 * that is not a letter, a digit or whitespace, such as "!"). The same rules live in packages/core for the forms.
 */
export function passwordProblems(password) {
  if (typeof password !== 'string') return [`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`];
  const problems = [];
  if (password.length < MIN_PASSWORD_LENGTH) problems.push(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) problems.push(`The password must be at most ${MAX_PASSWORD_BYTES} bytes long.`);
  if (!/\p{Lu}/u.test(password)) problems.push('The password needs an uppercase letter.');
  if (!/\p{Ll}/u.test(password)) problems.push('The password needs a lowercase letter.');
  if (!/\p{Nd}/u.test(password)) problems.push('The password needs a digit.');
  if (!/[^\p{L}\p{Nd}\s]/u.test(password)) problems.push('The password needs a special character, such as !');
  return problems;
}

export async function hashPassword(password) {
  const problems = passwordProblems(password);
  if (problems.length) throw new Error(problems.join(' '));
  return bcrypt.hash(password, COST);
}

export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || typeof hash !== 'string') return false;
  return bcrypt.compare(password, hash);
}
