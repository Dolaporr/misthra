// Partners: other Elysium apps (launchpads, aggregators) that send creators to Misthra
// or call its router API from their own site. A partner can:
//   - call a small set of public endpoints from its own origin (CORS, no cookies),
//   - tag router plans with `ref`, so routers created through it are attributed,
//   - receive the creator back on its own site after setup (return URL on its hosts only).
// No deal terms live here: attribution is a record, not a payout.
import { readFileSync } from 'node:fs';

const DEFAULT_FILE = new URL('../../chain/partners.json', import.meta.url);
const ID = /^[a-z0-9-]{2,32}$/;

export function loadPartners(env = process.env) {
  let list = [];
  try { list = JSON.parse(readFileSync(env.PARTNERS_FILE || DEFAULT_FILE, 'utf8')); } catch { list = []; }
  return list.filter((p) => p && ID.test(p.id)).map((p) => ({
    id: p.id, name: String(p.name ?? p.id), url: p.url ?? null,
    origins: (p.origins ?? []).map((o) => String(o).replace(/\/+$/, '')),
    returnHosts: (p.returnHosts ?? []).map((h) => String(h).toLowerCase()),
  }));
}

// Endpoints a partner page may call from its own origin. Read-only data, plus building
// unsigned transactions that the creator signs in their own wallet. Never sessions or alerts.
const PARTNER_ROUTES = [
  ['GET', /^\/api\/capabilities$/],
  ['GET', /^\/api\/launches(\/0x[0-9a-fA-F]{40}(\/(candles|trades|holders))?)?$/],
  ['GET', /^\/api\/partners(\/[a-z0-9-]+(\/routers)?)?$/],
  ['GET', /^\/api\/router\/pads$/],
  ['GET', /^\/api\/router\/0x[0-9a-fA-F]{40}$/],
  ['POST', /^\/api\/router\/plan$/],
  ['POST', /^\/api\/router\/0x[0-9a-fA-F]{40}\/prepare$/],
];

export function partnerForOrigin(partners, origin) {
  return partners.find((p) => p.origins.includes(origin)) ?? null;
}

// For a preflight, the method being asked about is in Access-Control-Request-Method.
export function partnerMayCall(req) {
  const method = req.method === 'OPTIONS' ? String(req.headers['access-control-request-method'] ?? '').toUpperCase() : req.method;
  const path = req.path ?? req.url.split('?')[0];
  return PARTNER_ROUTES.some(([m, re]) => m === method && re.test(path));
}

// A return URL is followed only if it is https on one of the partner's own hosts.
export function safeReturnUrl(partner, url) {
  if (!partner || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && partner.returnHosts.includes(u.hostname.toLowerCase()) ? u.toString() : null;
  } catch { return null; }
}
