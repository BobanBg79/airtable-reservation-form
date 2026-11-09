import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, hashPassword, passwordProblems, verifyPassword } from './_password.js';

test('a good password has no problems', () => {
  assert.deepEqual(passwordProblems('Correct-horse-9battery'), []);
  assert.deepEqual(passwordProblems('Abcdefgh1!'), []); // exactly 10 characters
});

test('too short and too long passwords are refused', () => {
  assert.match(passwordProblems('Abcdefg1!')[0], /at least 10/); // 9 characters
  assert.equal(MIN_PASSWORD_LENGTH, 10);
  assert.ok(passwordProblems('Aa1!' + 'a'.repeat(MAX_PASSWORD_BYTES)).some((p) => /at most/.test(p)));
  assert.ok(passwordProblems('Aa1!' + 'š'.repeat(40)).some((p) => /at most/.test(p))); // 80+ bytes
  assert.equal(passwordProblems(undefined).length, 1);
});

test('each missing kind of character is named: uppercase, lowercase, digit, special', () => {
  assert.deepEqual(passwordProblems('abcdefgh1!'), ['The password needs an uppercase letter.']);
  assert.deepEqual(passwordProblems('ABCDEFGH1!'), ['The password needs a lowercase letter.']);
  assert.deepEqual(passwordProblems('Abcdefghi!'), ['The password needs a digit.']);
  assert.deepEqual(passwordProblems('Abcdefgh12'), ['The password needs a special character, such as !']);
  assert.equal(passwordProblems('abcdefghij').length, 3);
  assert.equal(passwordProblems('Abcdefgh1 ').length, 1); // whitespace is not a special character
});

test('hash and verify round trip; the hash is salted and never the password', async () => {
  const pw = 'Correct-horse-9battery';
  const a = await hashPassword(pw);
  const b = await hashPassword(pw);
  assert.notEqual(a, b);
  assert.ok(!a.includes(pw));
  assert.match(a, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword(pw, a), true);
  assert.equal(await verifyPassword('Wrong-horse-9battery', a), false);
});

test('verify is false for missing input', async () => {
  assert.equal(await verifyPassword(undefined, 'x'), false);
  assert.equal(await verifyPassword('abc', undefined), false);
});

test('hashPassword refuses a weak password', async () => {
  await assert.rejects(() => hashPassword('short'), /at least/);
});
