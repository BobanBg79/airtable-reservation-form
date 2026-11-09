// Deny by default for api/: every route declares a guard, the declared permissions are real, and the route table
// is the one the authentication brief approved. Reads the real route files as text. What each role actually gets
// from each route (200, 403, 401) is tested in scripts/api-routes-real.test.mjs, which calls the real route files.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PERMISSIONS } from '../packages/core/src/models/permissions.ts';
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
  '/api/users/edit': { kind: 'protect', permission: 'can_edit_user' },
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
