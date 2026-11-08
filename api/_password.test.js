import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_PASSWORD_BYTES, MIN_PASSWORD_LENGTH, hashPassword, passwordProblems, verifyPassword } from './_password.js';

test('a good password has no problems', () => {
  assert.deepEqual(passwordProblems('correct horse battery'), []);
});

test('too short and too long passwords are refused', () => {
  assert.equal(passwordProblems('a'.repeat(MIN_PASSWORD_LENGTH - 1)).length, 1);
  assert.equal(passwordProblems('a'.repeat(MAX_PASSWORD_BYTES + 1)).length, 1);
  assert.equal(passwordProblems('š'.repeat(40)).length, 1); // 80 bytes
  assert.equal(passwordProblems(undefined).length, 1);
});

test('hash and verify round trip; the hash is salted and never the password', async () => {
  const pw = 'correct horse battery';
  const a = await hashPassword(pw);
  const b = await hashPassword(pw);
  assert.notEqual(a, b);
  assert.ok(!a.includes(pw));
  assert.match(a, /^\$2[aby]\$12\$/);
  assert.equal(await verifyPassword(pw, a), true);
  assert.equal(await verifyPassword('wrong horse battery', a), false);
});

test('verify is false for missing input', async () => {
  assert.equal(await verifyPassword(undefined, 'x'), false);
  assert.equal(await verifyPassword('abc', undefined), false);
});

test('hashPassword refuses a weak password', async () => {
  await assert.rejects(() => hashPassword('short'), /at least/);
});
