// The login flow (docs/briefs/authentication.md, "Login flow (exact order)"). Pure: the SQL client and the
// password check are passed in, so tests can use fakes. Returns { status, body, headers? } for the handler.
import { isLimited, recordAttemptQuery } from './_loginLimits.js';
import { verifyPassword } from './_password.js';
import { createSessionQuery, generateToken, resolveSession, sessionPayload } from './_sessions.js';

export const INVALID = 'Invalid email or password';

// A valid bcrypt hash (cost 12) of a random string nobody knows. An unknown email is checked against it,
// so the response takes as long as for a real user and timing reveals nothing.
const DUMMY_HASH = '$2b$12$sREcj0611GRaqFW6JEX6Ou1pvAkIHiTBahoS7JozjXpDShb8Ivfr.';

const MAX_EMAIL_LENGTH = 254;
const MAX_PASSWORD_LENGTH = 1000;

export async function performLogin(sql, { email, password, ip }, { verify = verifyPassword } = {}) {
  const normalized = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!normalized || normalized.length > MAX_EMAIL_LENGTH || typeof password !== 'string' || !password || password.length > MAX_PASSWORD_LENGTH) {
    return { status: 400, body: { error: 'Email and password are required.' } };
  }

  // 1. Limits first. Over the limit: 429, the password is not checked and no attempt is recorded.
  if (await isLimited(sql, { email: normalized, ip })) {
    return {
      status: 429,
      headers: { 'Retry-After': '900' },
      body: { error: 'Too many attempts. Try again in a few minutes.' },
    };
  }

  // The hash is read here and nowhere else, and it never leaves this function.
  const found = await sql.query(
    `select u.id::text as id, u.password_hash, (u.is_active and r.is_active) as can_login
       from users u join roles r on r.id = u.role_id
      where u.email = $1`,
    [normalized],
  );
  const user = found[0];
  const passwordOk = await verify(password, user ? user.password_hash : DUMMY_HASH); // always exactly one check

  // 2. Unknown email, inactive user or wrong password: record the failure, return the same 401.
  if (!user || !user.can_login || !passwordOk) {
    await recordAttemptQuery(sql, { email: normalized, ip, userId: user?.id ?? null, succeeded: false });
    return { status: 401, body: { error: INVALID } };
  }

  // 3. Success, in one transaction: the attempt, last_login_at and the session.
  const { token, tokenHash } = generateToken();
  await sql.transaction([
    recordAttemptQuery(sql, { email: normalized, ip, userId: user.id, succeeded: true }),
    sql.query('update users set last_login_at = now(), updated_by = $1::bigint where id = $1::bigint', [user.id]),
    createSessionQuery(sql, user.id, tokenHash),
  ]);

  const session = await resolveSession(sql, token);
  if (!session) throw new Error('The new session could not be read back.');
  return { status: 200, body: { token, ...sessionPayload(session) } };
}
