// The one place that reads and parses .env.local for the scripts (check:env, db:seed).
// Returns the file's variables only; it never touches process.env, so an ambient shell value
// cannot sneak in.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENV_LOCAL = path.join(ROOT, '.env.local');

/** Parse the text of an env file. Strips a UTF-8 BOM (PowerShell 5.1 adds one and it hides the first variable). */
export function parseEnv(text) {
  const env = {};
  for (const line of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const m = line.match(/^(\w+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
  return env;
}

/** Variables from .env.local, or null when the file does not exist. */
export function loadEnvLocal() {
  return fs.existsSync(ENV_LOCAL) ? parseEnv(fs.readFileSync(ENV_LOCAL, 'utf8')) : null;
}
