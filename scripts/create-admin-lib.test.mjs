import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databaseHost, normalizeEmail, sameDatabase, validateAdminInput } from './create-admin-lib.mjs';

const good = { email: ' Owner@Example.COM ', firstName: ' Slobodan ', lastName: 'K', phone: '', password: 'correct horse battery' };

test('normalizes the email and names, and treats an empty phone as none', () => {
  const { value, problems } = validateAdminInput(good);
  assert.deepEqual(problems, []);
  assert.equal(value.email, 'owner@example.com');
  assert.equal(value.firstName, 'Slobodan');
  assert.equal(value.phone, null);
  assert.equal(normalizeEmail(undefined), '');
});

test('reports every problem', () => {
  const { problems } = validateAdminInput({ email: 'nope', firstName: '', lastName: '', phone: '12 34', password: 'short' });
  assert.equal(problems.length, 5);
});

test('accepts a valid phone', () => {
  assert.deepEqual(validateAdminInput({ ...good, phone: '+381601234567' }).problems, []);
});

test('databaseHost drops credentials and the pooler suffix', () => {
  assert.equal(databaseHost('postgresql://u:secret@ep-abc-pooler.eu-central-1.aws.neon.tech/db?x=1'), 'ep-abc.eu-central-1.aws.neon.tech');
  assert.equal(databaseHost('nonsense'), undefined);
});

test('sameDatabase compares endpoints, pooled or not', () => {
  const app = 'postgresql://delta_app:a@ep-abc-pooler.eu.aws.neon.tech/neondb';
  assert.equal(sameDatabase(app, 'postgresql://neondb_owner:b@ep-abc.eu.aws.neon.tech/neondb'), true);
  assert.equal(sameDatabase(app, 'postgresql://neondb_owner:b@ep-other.eu.aws.neon.tech/neondb'), false);
  assert.equal(sameDatabase(app, undefined), false);
});
