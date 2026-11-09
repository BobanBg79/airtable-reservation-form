// Deny by default for api/: every route declares a guard, the declared permissions are real, the route table
// is the one the authentication brief approved, and a role x endpoint matrix shows who gets what.
// The matrix here uses the real guard with a stub handler; scripts/api-routes-real.test.mjs calls the real route files and handlers.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fakeRes, fakeSql } from '../api/_fakeSql.js';
import { makeGuards } from '../api/_guardCore.js';
import { generateToken } from '../api/_sessions.js';
import { INITIAL_ROLE_PERMISSIONS, PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { auditRoutes, ruleOf } from './api-routes.mjs';

const routes = auditRoutes();

// The policy of docs/briefs/authentication.md ("Guard"). Changing it is a decision, so it is pinned here.
const EXPECTED = {
  '/api/auth/login': { kind: 'public', permission: null },
  '/api/auth/me': { kind: 'authenticated', permission: null },
  '/api/auth/logout': { kind: 'authenticated', permission: null },
  '/api/auth/logout-all': { kind: 'authenticated', permission: null },
  '/api/calendar': { kind: 'protect', permission: 'can_view_reservation' },
  '/api/apartments': { kind: 'protect', permission: 'can_view_apartment' },
  '/api/users': { kind: 'protect', permission: 'can_view_user' },
  '/api/roles': { kind: 'protect', permission: 'can_view_user' },
  '/api/users/create': { kind: 'protect', permission: 'can_create_user' },
};

test('every route in api/ declares a guard (protect, authenticated or publicRoute)', () => {
  const unguarded = routes.filter((r) => r.rule === null).map((r) => r.route);
  assert.deepEqual(unguarded, [], `routes without a guard: ${unguarded.join(', ')}`);
  assert.ok(routes.length >= Object.keys(EXPECTED).length);
});

test('the only public route is login', () => {
  assert.deepEqual(routes.filter((r) => r.rule?.kind === 'public').map((r) => r.route), ['/api/auth/login']);
});

test('every permission a route asks for exists in packages/core', () => {
  for (const r of routes.filter((x) => x.rule?.kind === 'protect')) {
    assert.ok(PERMISSIONS.includes(r.rule.permission), `${r.route}: unknown permission ${r.rule.permission}`);
  }
});

test('the route table is exactly the approved one (a new or changed route must be added here on purpose)', () => {
  assert.deepEqual(Object.fromEntries(routes.map((r) => [r.route, r.rule])), EXPECTED);
});

test('the auditor really rejects an unguarded route', () => {
  assert.equal(ruleOf('export default async function handler(req, res) {}'), null);
  assert.equal(ruleOf('export default function handler() {}'), null);
  assert.equal(ruleOf("export const x = protect('can_view_user', h);"), null); // not the default export
  assert.equal(ruleOf("export default protect(h);"), null); // protect without a permission
  assert.equal(ruleOf("export default protect('can_view_user', h);\nexport default other;"), null);
  assert.deepEqual(ruleOf("export default protect('can_view_user', async function handler() {});"), { kind: 'protect', permission: 'can_view_user' });
  assert.deepEqual(ruleOf('export default authenticated(h);'), { kind: 'authenticated', permission: null });
  assert.deepEqual(ruleOf('export default publicRoute(h);'), { kind: 'public', permission: null });
});

// ---- role x endpoint matrix ----

function guardFor(rule, permissions) {
  const sql = fakeSql([
    [
      'update sessions',
      permissions
        ? [{ session_id: '1', expires_at: new Date(), user_id: '5', email: 'a@b.co', first_name: 'A', last_name: 'B', role: 'x', permissions }]
        : [],
    ],
  ]);
  const { protect, authenticated, publicRoute } = makeGuards(() => sql);
  const ok = (req, res) => res.status(200).json({ ok: true });
  return rule.kind === 'protect' ? protect(rule.permission, ok) : rule.kind === 'authenticated' ? authenticated(ok) : publicRoute(ok);
}

async function statusFor(rule, permissions, withToken = true) {
  const req = { method: 'GET', headers: withToken ? { authorization: `Bearer ${generateToken().token}` } : {} };
  const res = fakeRes();
  await guardFor(rule, permissions)(req, res);
  return res.statusCode;
}

test('matrix: without a token every route is 401, except the public one', async () => {
  for (const { route, rule } of routes) {
    assert.equal(await statusFor(rule, null, false), rule.kind === 'public' ? 200 : 401, route);
  }
});

test('matrix: a token that does not resolve (unknown, expired, inactive session or user) is 401 everywhere but login', async () => {
  for (const { route, rule } of routes) {
    assert.equal(await statusFor(rule, null, true), rule.kind === 'public' ? 200 : 401, route);
  }
});

test('matrix: the expected outcomes for the seeded roles, spelled out', async () => {
  const outcome = async (role, route) => statusFor(EXPECTED[route], [...INITIAL_ROLE_PERMISSIONS[role]]);
  // Users is admin only.
  assert.equal(await outcome('admin', '/api/users'), 200);
  assert.equal(await outcome('admin', '/api/roles'), 200);
  assert.equal(await outcome('admin', '/api/users/create'), 200);
  for (const role of ['business_owner', 'manager', 'cleaning_lady', 'handyman']) {
    assert.equal(await outcome(role, '/api/users'), 403, role);
    assert.equal(await outcome(role, '/api/roles'), 403, role);
    assert.equal(await outcome(role, '/api/users/create'), 403, role);
  }
  // Calendar and apartments: everyone with the view permissions.
  for (const role of ['admin', 'business_owner', 'manager']) {
    assert.equal(await outcome(role, '/api/calendar'), 200, role);
    assert.equal(await outcome(role, '/api/apartments'), 200, role);
  }
  for (const role of ['cleaning_lady', 'handyman']) {
    assert.equal(await outcome(role, '/api/calendar'), 403, role);
    assert.equal(await outcome(role, '/api/apartments'), 403, role);
  }
  // Me and logout: any signed-in user, even a role with no permissions.
  for (const role of ROLES) {
    assert.equal(await outcome(role, '/api/auth/me'), 200, role);
    assert.equal(await outcome(role, '/api/auth/logout'), 200, role);
    assert.equal(await outcome(role, '/api/auth/logout-all'), 200, role);
  }
});

test('matrix: changing a role changes what its users can do, with no code change (permissions are read per request)', async () => {
  const rule = EXPECTED['/api/users'];
  assert.equal(await statusFor(rule, []), 403);
  assert.equal(await statusFor(rule, ['can_view_user']), 200);
});
