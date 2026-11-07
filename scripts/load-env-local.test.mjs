import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseEnv } from './load-env-local.mjs';

test('parses quoted and unquoted values', () => {
  assert.deepEqual(parseEnv('A="one"\nB=two\n'), { A: 'one', B: 'two' });
});

test('keeps the first variable when the file starts with a UTF-8 BOM', () => {
  // PowerShell 5.1 `Set-Content -Encoding utf8` writes a BOM; it used to hide NEON_BRANCH.
  assert.deepEqual(parseEnv('﻿NEON_BRANCH="dev"\nOTHER=1'), { NEON_BRANCH: 'dev', OTHER: '1' });
});

test('handles CRLF line endings and ignores comments and blank lines', () => {
  assert.deepEqual(parseEnv('# comment\r\n\r\nA=1\r\nB="2"\r\n'), { A: '1', B: '2' });
});

test('keeps = inside values (connection strings)', () => {
  assert.equal(parseEnv('U="postgresql://u:p@h/db?sslmode=require&x=1"').U, 'postgresql://u:p@h/db?sslmode=require&x=1');
});
