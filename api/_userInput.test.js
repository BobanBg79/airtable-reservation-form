import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateNewUser, validateUserEdit } from './_userInput.js';

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

// ---- edit ----

test('edit: only the fields present are changed, cleaned the same way as on create', () => {
  const { value, fields } = validateUserEdit({ id: 9, firstName: ' Ana ', phone: '', roleId: 3, isActive: false });
  assert.deepEqual(fields, {});
  assert.deepEqual(value, { id: '9', changes: { firstName: 'Ana', phone: null, roleId: '3', isActive: false } });
});

test('edit: a password that is missing, null or empty means keep the current one; a real one is checked', () => {
  for (const password of [undefined, null, '']) {
    assert.deepEqual(validateUserEdit({ id: '9', firstName: 'Ana', password }).value.changes, { firstName: 'Ana' });
  }
  assert.equal(validateUserEdit({ id: '9', password: 'Correct-horse-9battery' }).value.changes.password, 'Correct-horse-9battery');
  assert.match(validateUserEdit({ id: '9', password: 'short' }).fields.password, /at least 10/);
});

test('edit: the id is required and must be a number; the email can never be changed', () => {
  for (const id of [undefined, '', 'abc', '0', '-1', '1; drop table users', '1'.repeat(30)]) {
    assert.equal(validateUserEdit({ id, firstName: 'Ana' }).fields.id, 'Invalid user id.', JSON.stringify(id));
  }
  assert.equal(validateUserEdit({ id: '9', email: 'new@example.com' }).fields.email, 'The email cannot be changed.');
});

test('edit: a present field is checked like on create (empty name, bad phone, bad role, non-boolean active)', () => {
  const { fields } = validateUserEdit({ id: '9', firstName: ' ', lastName: 'x'.repeat(101), phone: '12 34', roleId: 'abc', isActive: 'yes' });
  assert.equal(fields.firstName, 'First name is required.');
  assert.match(fields.lastName, /too long/);
  assert.match(fields.phone, /6 to 15 digits/);
  assert.equal(fields.roleId, 'Role is required.');
  assert.equal(fields.isActive, 'Active must be true or false.');
});

test('edit: a body with only an id has no changes', () => {
  assert.deepEqual(validateUserEdit({ id: '9' }).value, { id: '9', changes: {} });
  assert.ok(Object.keys(validateUserEdit(undefined).fields).length > 0);
});
