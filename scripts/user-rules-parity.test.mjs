// The user form rules exist twice: on the server (api/_password.js, api/_userInput.js), which is the source of
// truth, and in packages/core (userForm.ts), which the screens use for the message under a field. api/ cannot
// import packages/core, so this test runs BOTH real implementations on the same inputs and fails if they ever
// disagree. Nothing is re-implemented here: both sides are imported and called.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordProblems as serverPasswordProblems } from '../api/_password.js';
import { validateNewUser, validateUserEdit } from '../api/_userInput.js';
import {
  passwordProblems as corePasswordProblems,
  toCreateUserRequest,
  validateUserForm,
} from '../packages/core/src/models/userForm.ts';

const PASSWORDS = [
  '',
  'short',
  'Abcdefg1!', // 9 characters
  'Abcdefgh1!', // 10 characters, good
  'abcdefgh1!',
  'ABCDEFGH1!',
  'Abcdefghi!',
  'Abcdefgh12',
  'abcdefghij',
  'Abcdefgh1 ', // a space is not a special character
  'Correct-horse-9battery',
  'Aa1!' + 'a'.repeat(68), // exactly 72 bytes
  'Aa1!' + 'a'.repeat(69), // 73 bytes
  'Aa1!' + 'š'.repeat(40), // 84 bytes
  'Šifra-Ćirilica9',
  'Пароль-Кириллица9',
  'ÄÖÜ-äöü-12345',
  '١٢٣٤٥٦٧٨٩٠Aa!', // Arabic-Indic digits count as digits
];

test('the password rules: core and the server give the same messages for the same passwords', () => {
  for (const password of PASSWORDS) {
    assert.deepEqual(corePasswordProblems(password), serverPasswordProblems(password), JSON.stringify(password));
  }
});

const good = {
  email: 'ana@example.com',
  firstName: 'Ana',
  lastName: 'Petrovic',
  phone: '+381601234567',
  roleId: '3',
  password: 'Correct-horse-9battery',
};

const FORMS = [
  good,
  { ...good, phone: '' },
  { ...good, email: '' },
  { ...good, email: 'nope' },
  { ...good, email: 'a b@c.com' },
  { ...good, email: ' Ana@Example.COM ' },
  { ...good, email: 'a@b.co' + 'x'.repeat(260) },
  { ...good, firstName: '' },
  { ...good, firstName: '   ' },
  { ...good, lastName: 'x'.repeat(101) },
  { ...good, phone: '12345' },
  { ...good, phone: '+381 60 1234' },
  { ...good, phone: '0601234567' },
  { ...good, roleId: '' },
  { ...good, password: '' },
  { ...good, password: 'short' },
  { email: '', firstName: '', lastName: '', phone: '', roleId: '', password: '' },
];

test('the create form: core and the server give the same message for the same field', () => {
  for (const form of FORMS) {
    assert.deepEqual(validateUserForm(form, 'create'), validateNewUser(form).fields, JSON.stringify(form));
  }
});

test('what core builds for a good create form is accepted by the server and comes out unchanged', () => {
  const request = toCreateUserRequest({ ...good, email: ' Ana@Example.COM ', firstName: ' Ana ', phone: '' });
  const { value, fields } = validateNewUser(request);
  assert.deepEqual(fields, {});
  assert.deepEqual(value, { ...request, phone: null });
});

test('the edit form: core and the server give the same messages for the fields the edit sends', () => {
  const edits = [
    { firstName: '', lastName: 'Petrovic', phone: '', roleId: '3', password: '' },
    { firstName: 'Ana', lastName: 'x'.repeat(101), phone: '12', roleId: '3', password: 'short' },
    { firstName: 'Ana', lastName: 'Petrovic', phone: '+381601234567', roleId: '3', password: '' },
  ];
  for (const e of edits) {
    const core = validateUserForm({ email: '', ...e }, 'edit');
    const server = validateUserEdit({ id: '9', ...e }).fields;
    assert.deepEqual(core, server, JSON.stringify(e));
  }
});
