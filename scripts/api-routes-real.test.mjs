// The real route files, called for real: every role against every route in api/, through the real guard and the
// real handler, with only the database replaced by a fake (api/_db.js is mocked, so nothing connects to Neon).
// Who may call what is NOT written here: it is read from the route file itself (`route.guard`, set by protect /
// authenticated / publicRoute), and scripts/api-guard.test.mjs pins that against the approved policy.
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
    ['from roles where', [{ id: '1', name: 'admin' }]],
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
      assert.deepEqual(body.permissions, [...INITIAL_ROLE_PERMISSIONS[role]]);
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
    check: (body, role) => {
      assert.equal(body.length, 1);
      assert.equal(body[0].name, 'Egzotik');
      // field filtering by the caller's permissions, done by the real handler
      const perms = INITIAL_ROLE_PERMISSIONS[role];
      assert.equal('ownerName' in body[0], perms.includes('can_view_apartment_owner_contact'), `${role}: ownerName`);
      assert.equal('monthlyRentEur' in body[0], perms.includes('can_view_apartment_rent'), `${role}: monthlyRentEur`);
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
};

const routes = listRoutes();

test('every route file has a call defined here (a new route must be added on purpose)', () => {
  assert.deepEqual(routes.map((r) => r.route).sort(), Object.keys(CALLS).sort());
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
    const allowed = guard?.kind === 'authenticated' || INITIAL_ROLE_PERMISSIONS[role].includes(guard?.permission);
    test(`${route}: ${role} gets ${allowed ? '200 with the data' : '403 and the handler never runs'}`, async () => {
      const { res, handlerQueries } = await call(handler, request, role);
      if (allowed) {
        assert.equal(res.statusCode, 200);
        check(res.body, role);
      } else {
        assert.equal(res.statusCode, 403);
        assert.deepEqual(handlerQueries, [], 'a refused call must not reach the handler');
      }
    });
  }
}
