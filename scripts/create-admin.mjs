// `npm run db:create-admin`: creates the first user, with the admin role. ONE-OFF, run by the
// database owner in their own terminal (ADR 0007, docs/database-migrations.md).
//
// Safety:
//   - Credentials are typed at run time (the password is not echoed). They are never read from an
//     argument, a file or the environment, so they never reach Git, shell history or a log.
//   - It refuses to run without a real terminal, so nothing can pipe a password into it.
//   - Same environment guard as the seed (dev branch, delta_app in DATABASE_URL, not on Vercel or CI).
//     It then connects as the database owner (MIGRATION_DATABASE_URL), which must point at the same
//     Neon endpoint as DATABASE_URL, so it cannot reach another branch.
//   - It refuses if an admin user already exists, and never overwrites or deletes anything.
import readline from 'node:readline';
import { neon } from '@neondatabase/serverless';
import { OWNER_ROLE, roleOf } from '../api/_dbGuard.js';
import { hashPassword } from '../api/_password.js';
import { sameDatabase, validateAdminInput } from './create-admin-lib.mjs';
import { loadEnvLocal } from './load-env-local.mjs';
import { assertLocalScriptAllowed } from './local-guard.mjs';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const fileEnv = loadEnvLocal();
if (!fileEnv) fail('.env.local not found.');
try {
  assertLocalScriptAllowed(fileEnv, process.env);
} catch {
  process.exit(1);
}
if (!process.stdin.isTTY) fail('Run this in your own terminal: it asks for the credentials and refuses piped input.');

const ownerUrl = fileEnv.MIGRATION_DATABASE_URL;
if (roleOf(ownerUrl) !== OWNER_ROLE) fail(`MIGRATION_DATABASE_URL must connect as "${OWNER_ROLE}".`);
if (!sameDatabase(ownerUrl, fileEnv.DATABASE_URL)) fail('MIGRATION_DATABASE_URL and DATABASE_URL point at different databases.');

const sql = neon(ownerUrl);

const admins = await sql.query(
  `select u.email from users u join roles r on r.id = u.role_id where r.name = 'admin'`,
);
if (admins.length > 0) fail('An admin already exists. Use the app (edit user) to change it; this script never overwrites.');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
let muted = false;
const write = rl._writeToOutput.bind(rl);
rl._writeToOutput = (text) => {
  if (!muted) write(text);
  else if (text.includes('\n') || text.includes('\r')) write('\n'); // hide what is typed, keep the newline
};
const ask = (question, { hidden = false } = {}) =>
  new Promise((resolve) => {
    rl.question(question, (answer) => {
      muted = false;
      resolve(answer);
    });
    muted = hidden;
  });

console.log('Create the first admin (dev branch). The password is not shown while you type.');
const email = await ask('Email: ');
const firstName = await ask('First name: ');
const lastName = await ask('Last name: ');
const phone = await ask('Phone (optional): ');
const password = await ask('Password (10+ characters with upper and lower case, a digit and a special character such as !): ', { hidden: true });
const again = await ask('Repeat the password: ', { hidden: true });
rl.close();

if (password !== again) fail('The passwords do not match. Nothing was created.');
const { value, problems } = validateAdminInput({ email, firstName, lastName, phone, password });
if (problems.length) fail(['Nothing was created:', ...problems.map((p) => `  - ${p}`)].join('\n'));

const passwordHash = await hashPassword(password);
const rows = await sql.query(
  `insert into users (email, password_hash, first_name, last_name, phone, role_id, created_by, updated_by)
   select $1, $2, $3, $4, $5, r.id, 'create-admin', 'create-admin' from roles r where r.name = 'admin'
   returning id`,
  [value.email, passwordHash, value.firstName, value.lastName, value.phone],
);
console.log(`Admin created: ${value.email} (id ${rows[0].id}).`);
