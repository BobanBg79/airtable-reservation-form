// Login rate limiting (docs/briefs/authentication.md). Every attempt is recorded in `login_attempts`
// (insert only). Only FAILED attempts count, in a window of 15 minutes:
//   - 5 failures for the same email from the same IP, or
//   - 30 failures from the same IP
// give 429. There is deliberately no lockout by email alone, so nobody can lock the admin out by typing
// wrong passwords for the admin's email from elsewhere.
export const WINDOW_MINUTES = 15;
export const MAX_FAILURES_PER_EMAIL_AND_IP = 5;
export const MAX_FAILURES_PER_IP = 30;

/**
 * The caller's IP: on Vercel the first value of `x-forwarded-for` (Vercel sets it, a client cannot override
 * it there); locally the socket address.
 */
export function getClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim();
  return first || req.socket?.remoteAddress || 'unknown';
}

/** True when this email + IP (or this IP) already has too many failures in the window. */
export async function isLimited(sql, { email, ip }) {
  const rows = await sql.query(
    `select count(*) filter (where email = $1)::int as pair_failures, count(*)::int as ip_failures
       from login_attempts
      where ip = $2
        and not succeeded
        and created_at > now() - make_interval(mins => $3::int)`,
    [email, ip, WINDOW_MINUTES],
  );
  const { pair_failures = 0, ip_failures = 0 } = rows[0] ?? {};
  return pair_failures >= MAX_FAILURES_PER_EMAIL_AND_IP || ip_failures >= MAX_FAILURES_PER_IP;
}

/** The query that records an attempt (returned as is so it can run inside `sql.transaction`). */
export function recordAttemptQuery(sql, { email, ip, userId = null, succeeded }) {
  return sql.query('insert into login_attempts (email, ip, user_id, succeeded) values ($1, $2, $3::bigint, $4)', [
    email,
    ip,
    userId,
    succeeded,
  ]);
}
