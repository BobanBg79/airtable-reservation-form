// The real route files, called for real: every role against every route in api/, through the real guard and the
// real handler, with only the database replaced by a fake (api/_db.js is mocked, so nothing connects to Neon).
// What each role must get is written out below as literals (EXPECTED_STATUS), never computed from the rules.
// This test checks what the routes actually answer: 200 with the data, 403 when the permission is missing,
// 401 without a session, and that a refused call never reaches the handler's queries.
// Needs `node --experimental-test-module-mocks` (see the test:scripts script).
import assert from 'node:assert/strict';
import path from 'node:path';
import { mock, test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { fakeRes, fakeSql } from '../api/_fakeSql.js';
import { generateToken } from '../api/_sessions.js';
import { INITIAL_ROLE_PERMISSIONS, ROLES } from '../packages/core/src/models/permissions.ts';
import { API_DIR, listRoutes } from './api-routes.mjs';

// ---- the fake database: answers by the SQL it is asked ----

const state = { sql: null };
mock.module(pathToFileURL(path.join(API_DIR, '_db.js')).href, { namedExports: { getSql: () => state.sql } });

const SESSION_QUERY = 'with touched as';
const userRow = { id: '5', email: 'owner@example.com', first_name: 'Ana', last_name: 'Petrovic', phone: null, role: 'admin', is_active: true, last_login_at: null };
const apartmentRow = {
  id: '4', name: 'Egzotik', address: 'Test Street 4, Belgrade', apartment_number: '4C', floor: 1, building_name: 'Lala',
  area_m2: 41, owner_name: 'Test Owner Four', owner_phone: '+38160000004', monthly_rent_eur: 380,
  has_bathtub: false, has_terrace: false, has_dishwasher: true, parking_spot: null,
};

function databaseFor(role) {
  const permissions = [...INITIAL_ROLE_PERMISSIONS[role]];
  const session = { session_id: '11', expires_at: new Date('2026-12-08T10:00:00Z'), user_id: '5', email: 'a@b.co', first_name: 'A', last_name: 'B', role, permissions };
  return fakeSql([
    [SESSION_QUERY, [session]],
    ['from users u', [userRow]],
    ['from roles where id', [{ id: '2' }]], // the role lookup of create user
    ['from roles where', [{ id: '1', name: 'admin' }]],
    ['select 1 as taken from users', []],
    ['r.is_protected from roles r where', [{ id: '3', name: 'manager', is_protected: false }]], // the role lookup of edit role
    ['group by r.id', [{ id: '3', name: 'manager', is_protected: false, permissions: ['can_view_apartment'] }]],
    ['from permissions where is_active', [{ name: 'can_view_apartment' }]],
    ['insert into users', [{ id: '9' }]],
    ['from apartments', [apartmentRow]],
  ]);
}

/** Runs one route as `role` (or with no session when role is null). Returns the response and the database used. */
async function call(handler, { method, query = {}, body }, role) {
  const sql = role ? databaseFor(role) : fakeSql([[SESSION_QUERY, []]]);
  state.sql = sql;
  const headers = role ? { authorization: `Bearer ${generateToken().token}` } : {};
  const res = fakeRes();
  await handler({ method, query, body, headers }, res);
  const handlerQueries = sql.calls.filter((c) => !c.text.includes(SESSION_QUERY));
  return { res, handlerQueries };
}

// How to call each route, and what a successful answer must contain. (The rules are NOT here, only the calls.)
const CALLS = {
  '/api/auth/login': { request: { method: 'POST', body: {} } }, // public: no session needed; an empty login is a 400
  '/api/auth/me': {
    request: { method: 'GET' },
    check: (body, role) => {
      assert.equal(body.user.email, 'a@b.co');
      assert.equal(body.permissions.length, ME_PERMISSION_COUNT[role]);
      assert.equal(body.permissions.includes('can_create_user'), role === 'admin'); // only the admin may create users
    },
  },
  '/api/auth/logout': { request: { method: 'POST' }, check: (body) => assert.deepEqual(body, { ok: true }) },
  '/api/auth/logout-all': { request: { method: 'POST' }, check: (body) => assert.deepEqual(body, { ok: true }) },
  '/api/calendar': {
    request: { method: 'GET', query: { month: '2026-11' } },
    check: (body) => {
      assert.equal(body.month, '2026-11');
      assert.equal(body.apartments.length, 1);
      assert.ok(Array.isArray(body.reservations));
    },
  },
  '/api/apartments': {
    request: { method: 'GET' },
    // admin, business_owner and manager all have both the owner-contact and the rent permission by default
    check: (body) => {
      assert.equal(body.length, 1);
      assert.equal(body[0].name, 'Egzotik');
      assert.equal(body[0].ownerName, 'Test Owner Four');
      assert.equal(body[0].monthlyRentEur, 380);
    },
  },
  '/api/users': {
    request: { method: 'GET' },
    check: (body) => {
      assert.equal(body.length, 1);
      assert.equal(body[0].email, 'owner@example.com');
      assert.doesNotMatch(JSON.stringify(body), /password|\$2b/i);
    },
  },
  '/api/roles': { request: { method: 'GET' }, check: (body) => assert.deepEqual(body, [{ id: '1', name: 'admin' }]) },
  '/api/users/create': {
    request: {
      method: 'POST',
      body: { email: 'new@example.com', firstName: 'New', lastName: 'User', phone: '', roleId: '2', password: 'Correct-horse-9battery' },
    },
    check: (body) => {
      assert.equal(body.email, 'owner@example.com'); // the fake database answers the read-back with its one user
      assert.doesNotMatch(JSON.stringify(body), /password|\$2b/i);
    },
  },
  '/api/roles/permissions': {
    request: { method: 'GET' },
    check: (body) => {
      assert.deepEqual(body.permissions, ['can_view_apartment']); // the fake database knows one permission
      assert.deepEqual(body.roles, [{ id: '3', name: 'manager', isProtected: false, permissions: ['can_view_apartment'] }]);
    },
  },
  '/api/roles/edit': {
    request: { method: 'POST', body: { id: '3', permissions: ['can_view_apartment'] } },
    check: (body) => assert.deepEqual(body, { id: '3', name: 'manager', isProtected: false, permissions: ['can_view_apartment'] }),
  },
  '/api/users/edit': {
    request: { method: 'POST', body: { id: '9', firstName: 'Changed', password: 'New-password-77!' } },
    check: (body) => {
      assert.equal(body.email, 'owner@example.com');
      assert.doesNotMatch(JSON.stringify(body), /password|\$2b/i);
    },
  },
};

// What every role must get from every route, spelled out (not computed). 403 = refused before the handler runs.
const EVERYONE = { admin: 200, business_owner: 200, manager: 200, cleaning_lady: 200, handyman: 200 };
const VIEWERS_OF_RESERVATIONS_AND_APARTMENTS = { admin: 200, business_owner: 200, manager: 200, cleaning_lady: 403, handyman: 403 };
const ONLY_ADMIN = { admin: 200, business_owner: 403, manager: 403, cleaning_lady: 403, handyman: 403 };
const EXPECTED_STATUS = {
  '/api/auth/me': EVERYONE,
  '/api/auth/logout': EVERYONE,
  '/api/auth/logout-all': EVERYONE,
  '/api/calendar': VIEWERS_OF_RESERVATIONS_AND_APARTMENTS,
  '/api/apartments': VIEWERS_OF_RESERVATIONS_AND_APARTMENTS,
  '/api/users': ONLY_ADMIN,
  '/api/roles': ONLY_ADMIN,
  '/api/users/create': { ...ONLY_ADMIN, admin: 201 },
  '/api/users/edit': ONLY_ADMIN,
  '/api/roles/permissions': ONLY_ADMIN,
  '/api/roles/edit': ONLY_ADMIN,
};

// How many permissions /api/auth/me must report for each role (the initial sets of ADR 0007), written out.
const ME_PERMISSION_COUNT = { admin: 21, business_owner: 16, manager: 16, cleaning_lady: 0, handyman: 0 };

const routes = listRoutes();

test('every route file has a call and expected statuses defined here (a new route must be added on purpose)', () => {
  assert.deepEqual(routes.map((r) => r.route).sort(), Object.keys(CALLS).sort());
  assert.deepEqual(Object.keys(EXPECTED_STATUS).sort(), Object.keys(CALLS).filter((r) => r !== '/api/auth/login').sort());
});

for (const { file, route } of routes) {
  const handler = (await import(pathToFileURL(file).href)).default;
  const { guard } = handler;
  const { request, check } = CALLS[route] ?? {};

  test(`${route}: declares its guard on the exported handler`, () => {
    assert.ok(guard && ['public', 'authenticated', 'protect'].includes(guard.kind), `${route} has no guard`);
  });

  if (guard?.kind === 'public') {
    test(`${route}: public, the real handler answers without a session`, async () => {
      const { res } = await call(handler, request, null);
      assert.equal(res.statusCode, 400);
      assert.match(res.body.error, /required/i);
    });
    continue;
  }

  test(`${route}: no session is 401 and the handler never runs`, async () => {
    const { res, handlerQueries } = await call(handler, request, null);
    assert.equal(res.statusCode, 401);
    assert.deepEqual(handlerQueries, []);
  });

  for (const role of ROLES) {
    const expected = EXPECTED_STATUS[route][role];
    test(`${route}: ${role} gets ${expected}${expected === 403 ? ' and the handler never runs' : ' with the data'}`, async () => {
      const { res, handlerQueries } = await call(handler, request, role);
      assert.equal(res.statusCode, expected);
      if (expected === 403) assert.deepEqual(handlerQueries, [], 'a refused call must not reach the handler');
      else check(res.body, role);
    });
  }
}
