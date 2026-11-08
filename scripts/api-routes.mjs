// Audits the route files of api/ (used by scripts/api-guard.test.mjs). Deny by default: a route file is
// every .js file under api/ whose name does not start with "_" (those are helpers, Vercel does not serve
// them). Each one must export its handler through exactly one guard, as `export default protect('can_...',`,
// `export default authenticated(` or `export default publicRoute(`.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './load-env-local.mjs';

export const API_DIR = path.join(ROOT, 'api');

/** Route files under `dir` as { file, route } where route is like /api/auth/login. */
export function listRoutes(dir = API_DIR) {
  const out = [];
  const walk = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && !entry.name.startsWith('_')) {
        const rel = path.relative(dir, full).split(path.sep).join('/').replace(/\.js$/, '');
        out.push({ file: full, route: `/api/${rel}` });
      }
    }
  };
  walk(dir);
  return out.sort((a, b) => a.route.localeCompare(b.route));
}

/**
 * The guard a route source declares: { kind: 'protect' | 'authenticated' | 'public', permission },
 * or null when it declares none (or more than one default export), which is a failure.
 */
export function ruleOf(source) {
  const defaults = source.match(/^export default\b/gm) ?? [];
  if (defaults.length !== 1) return null;
  const m = /^export default (protect|authenticated|publicRoute)\(\s*(?:'(can_[a-z_]+)')?/m.exec(source);
  if (!m) return null;
  const [, guard, permission] = m;
  if (guard === 'protect') return permission ? { kind: 'protect', permission } : null;
  return { kind: guard === 'publicRoute' ? 'public' : 'authenticated', permission: null };
}

/** All routes with their declared rule (rule is null for an unguarded route). */
export function auditRoutes(dir = API_DIR) {
  return listRoutes(dir).map(({ file, route }) => ({ route, rule: ruleOf(fs.readFileSync(file, 'utf8')) }));
}
