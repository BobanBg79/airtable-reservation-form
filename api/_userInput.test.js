import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewUser } from './_userInput.js';

const good = {
  email: ' Ana@Example.COM ',
  firstName: ' Ana ',
  lastName: 'Petrovic',
  phone: '+381601234567',
  roleId: '2',
  password: 'Correct-horse-9battery',
};

test('a valid new user is cleaned: email trimmed and lowercased, names trimmed, role id as text', () => {
  const { value, fields } = validateNewUser({ ...good, roleId: 2 });
  assert.deepEqual(fields, {});
  assert.deepEqual(value, {
    email: 'ana@example.com',
    firstName: 'Ana',
    lastName: 'Petrovic',
    phone: '+381601234567',
    roleId: '2',
    password: 'Correct-horse-9battery',
  });
});

test('the phone is optional: missing, null and empty all mean none', () => {
  for (const phone of [undefined, null, '', '   ']) assert.equal(validateNewUser({ ...good, phone }).value.phone, null);
});

test('every required field is reported with its own message', () => {
  const { value, fields } = validateNewUser({});
  assert.equal(value, undefined);
  assert.deepEqual(Object.keys(fields).sort(), ['email', 'firstName', 'lastName', 'password', 'roleId']);
  assert.equal(fields.email, 'Email is required.');
  assert.equal(fields.firstName, 'First name is required.');
  assert.equal(fields.roleId, 'Role is required.');
});

test('invalid values: email, phone, role id, long names, weak password', () => {
  assert.equal(validateNewUser({ ...good, email: 'nope' }).fields.email, 'Enter a valid email address.');
  assert.equal(validateNewUser({ ...good, email: 'a b@c.com' }).fields.email, 'Enter a valid email address.');
  assert.match(validateNewUser({ ...good, phone: '12 34' }).fields.phone, /6 to 15 digits/);
  assert.match(validateNewUser({ ...good, firstName: 'x'.repeat(101) }).fields.firstName, /too long/);
  for (const roleId of ['abc', '0', '-1', '1; drop table users', '', null]) {
    assert.equal(validateNewUser({ ...good, roleId }).fields.roleId, 'Role is required.', JSON.stringify(roleId));
  }
  const weak = validateNewUser({ ...good, password: 'short' }).fields.password;
  assert.match(weak, /at least 10/);
  assert.match(weak, /uppercase/);
});

test('a body that is not an object is treated as empty', () => {
  for (const body of [undefined, null, 'x', [], 5]) assert.ok(Object.keys(validateNewUser(body).fields).length > 0);
});
