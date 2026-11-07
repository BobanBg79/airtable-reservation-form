// `npm run dev:api`: runs the functions in api/ on http://127.0.0.1:3000 against the Neon DEV branch,
// without `vercel dev` (no Vercel login needed). It is a small stand-in for local development only.
//
// - Reads connection details from .env.local only, and refuses unless they are safe: role delta_app,
//   branch dev, not on Vercel or CI, no DATABASE_URL in the shell (scripts/local-guard.mjs).
// - Listens on 127.0.0.1 only. A phone connected by USB reaches it with `adb reverse tcp:3000 tcp:3000`.
// - Restart it after editing a file in api/ (modules are cached).
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadEnvLocal } from './load-env-local.mjs';
import { assertLocalScriptAllowed } from './local-guard.mjs';

const fileEnv = loadEnvLocal();
if (!fileEnv) {
  console.error('.env.local not found.');
  process.exit(1);
}
try {
  assertLocalScriptAllowed(fileEnv, process.env);
} catch {
  process.exit(1);
}

// The functions read process.env, so copy the (now verified) file values into it.
Object.assign(process.env, fileEnv);

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT ?? 3000);

const sendJson = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  // Only /api/<name> where api/<name>.js exists. Files starting with "_" are helpers, not routes.
  const match = /^\/api\/([a-z][a-z0-9-]*)$/.exec(url.pathname);
  const file = match && path.join(ROOT, 'api', `${match[1]}.js`);
  if (!file || !fs.existsSync(file)) return sendJson(res, 404, { error: 'Not found' });

  // The bits of Vercel's request and response helpers the functions use. (No endpoint reads a
  // request body yet; add body parsing here together with the first write endpoint.)
  req.query = Object.fromEntries(url.searchParams);
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (body) => {
    sendJson(res, res.statusCode || 200, body);
    return res;
  };

  const started = Date.now();
  try {
    const mod = await import(pathToFileURL(file).href);
    await mod.default(req, res);
  } catch (e) {
    console.error(`${req.method} ${url.pathname} failed:`, e.message);
    if (!res.headersSent) sendJson(res, 500, { error: 'Function failed.' });
  }
  console.log(`${req.method} ${url.pathname}${url.search} -> ${res.statusCode} (${Date.now() - started} ms)`);
});

server.listen(PORT, HOST, () => {
  console.log(`API (Neon dev branch) listening on http://${HOST}:${PORT}`);
  console.log('Phone over USB: adb reverse tcp:3000 tcp:3000, then start Expo with EXPO_PUBLIC_API_URL=http://localhost:3000');
});
