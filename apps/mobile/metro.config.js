// Monorepo support is automatic in Expo SDK 52+; only the dev proxy below is custom.
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

/**
 * DEV ONLY: proxy `/api/*` from the Expo dev server to the deployed API.
 * The browser (`expo start` → `w`) then calls same-origin `/api/...`, so the
 * production API needs no CORS headers. Native apps call the API directly.
 */
const API_TARGET = (process.env.EXPO_PUBLIC_API_URL || 'https://airtable-reservation-form.vercel.app').replace(/\/+$/, '');

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(chunks.length ? Buffer.concat(chunks) : undefined));
    req.on('error', reject);
  });
}

async function proxyApi(req, res) {
  const method = req.method || 'GET';
  const headers = {};
  for (const name of ['accept', 'content-type', 'authorization', 'cookie']) {
    if (req.headers[name]) headers[name] = req.headers[name];
  }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  const upstream = await fetch(API_TARGET + req.url, { method, headers, body, redirect: 'manual' });

  res.statusCode = upstream.status;
  for (const name of ['content-type', 'cache-control', 'set-cookie', 'location']) {
    const value = upstream.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  res.end(Buffer.from(await upstream.arrayBuffer()));
}

// `enhanceMiddleware` is deprecated in Metro but still honoured by the Expo CLI dev server.
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (metroMiddleware, server) => {
  const base = previousEnhance ? previousEnhance(metroMiddleware, server) : metroMiddleware;
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith('/api/')) return base(req, res, next);
    proxyApi(req, res).catch((error) => {
      console.error(`[api proxy] ${req.method} ${req.url} → ${API_TARGET}:`, error);
      res.statusCode = 502;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: 'Dev proxy could not reach the API.' }));
    });
  };
};

module.exports = config;
