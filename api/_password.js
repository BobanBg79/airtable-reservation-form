// Password hashing (ADR 0007): bcrypt, a slow salted hash. The hash is checked only on the server
// and is never returned to any client. Files starting with "_" in api/ are not exposed as routes.
import bcrypt from 'bcryptjs';

export const MIN_PASSWORD_LENGTH = 12;
export const MAX_PASSWORD_BYTES = 72; // bcrypt ignores everything after 72 bytes, so refuse longer ones
const COST = 12;

/** Problems with a plain password, as short messages (empty array = acceptable). */
export function passwordProblems(password) {
  const problems = [];
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`The password must be at least ${MIN_PASSWORD_LENGTH} characters long.`);
  } else if (Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES) {
    problems.push(`The password must be at most ${MAX_PASSWORD_BYTES} bytes long.`);
  }
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
