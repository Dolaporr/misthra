// IPFS artwork through misthra.com: GET /api/img/ipfs/<cid>[/<path>]
//
// Public IPFS gateways are slow or refuse many requests (2026-11-09: ipfs.io, dweb.link,
// w3s.link and others failed for nearly every launch image; Pinata worked at 4–6 s). So the
// server fetches each image once, from several gateways at the same time, keeps the first
// valid answer on disk, and serves it with a one-year immutable cache (an IPFS CID never
// changes content).
//
// Safety: only IPFS paths (a CID and a plain path) are fetched, and only from the fixed
// gateway list, so this cannot be pointed at arbitrary hosts. The bytes must be a raster
// image (PNG, JPEG, GIF, WebP, AVIF), checked by their magic numbers; SVG, HTML and anything
// else are refused. Responses are capped in size and served sandboxed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

export const DEFAULT_GATEWAYS = ['https://ipfs.filebase.io', 'https://gateway.pinata.cloud', 'https://ipfs.io', 'https://dweb.link'];
export const MAX_BYTES = 5 * 1024 * 1024;
const CID = /^[A-Za-z0-9]{46,100}$/;
const SUBPATH = /^[A-Za-z0-9._~\-/]{0,200}$/;

export function sniffImage(buf) {
  const b = buf;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 6 && b.toString('ascii', 0, 4) === 'GIF8') return 'image/gif';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && /^(avif|avis)$/.test(b.toString('ascii', 8, 12))) return 'image/avif';
  return null;
}

export function ipfsPathOk(cid, sub = '') {
  return CID.test(cid) && SUBPATH.test(sub) && !sub.split('/').some((seg) => seg === '..' || seg === '.');
}

async function readCapped(res, max) {
  const reader = res.body.getReader(); const chunks = []; let size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) { reader.cancel().catch(() => {}); throw new Error('image too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}

export function createImageProxy({ cacheDir, gateways = DEFAULT_GATEWAYS, fetchImpl = globalThis.fetch, timeoutMs = 12_000, maxFiles = 5000, failTtlMs = 10 * 60_000, now = () => Date.now(), log = () => {} } = {}) {
  if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  const inflight = new Map(), failed = new Map(), memory = new Map();
  const keyOf = (path) => createHash('sha256').update(path).digest('hex').slice(0, 40);

  function fromCache(key) {
    if (memory.has(key)) return memory.get(key);
    if (!cacheDir) return null;
    const file = join(cacheDir, `${key}.img`);
    if (!existsSync(file)) return null;
    const body = readFileSync(file); const type = sniffImage(body);
    return type ? { body, type } : null;
  }

  function prune() {
    if (!cacheDir) return;
    const files = readdirSync(cacheDir).filter((f) => f.endsWith('.img'));
    if (files.length <= maxFiles) return;
    files.map((f) => ({ f, t: statSync(join(cacheDir, f)).mtimeMs })).sort((a, b) => a.t - b.t)
      .slice(0, files.length - maxFiles + Math.floor(maxFiles / 10)).forEach(({ f }) => { try { unlinkSync(join(cacheDir, f)); } catch {} });
  }

  async function fetchFromGateways(path) {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await Promise.any(gateways.map(async (g) => {
        const res = await fetchImpl(`${g.replace(/\/+$/, '')}/ipfs/${path}`, { signal: ctrl.signal, redirect: 'follow', headers: { Accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif' } });
        if (!res.ok) throw new Error(`${g}: HTTP ${res.status}`);
        const body = await readCapped(res, MAX_BYTES);
        const type = sniffImage(body);
        if (!type) throw new Error(`${g}: not a supported image`);
        return { body, type };
      }));
    } catch (err) {
      throw new Error(err instanceof AggregateError ? err.errors.map((e) => e.message).join('; ') : err.message);
    } finally { clearTimeout(timer); ctrl.abort(); }
  }

  async function get(cid, sub = '') {
    if (!ipfsPathOk(cid, sub)) { const e = new Error('Not an IPFS image path.'); e.status = 400; throw e; }
    const path = sub ? `${cid}/${sub}` : cid; const key = keyOf(path);
    const cached = fromCache(key);
    if (cached) return cached;
    const until = failed.get(key);
    if (until && until > now()) { const e = new Error('Image unavailable from IPFS gateways.'); e.status = 404; throw e; }
    if (!inflight.has(key)) {
      inflight.set(key, fetchFromGateways(path).then((img) => {
        if (cacheDir) { writeFileSync(join(cacheDir, `${key}.img`), img.body); prune(); } else memory.set(key, img);
        failed.delete(key); return img;
      }).catch((err) => { failed.set(key, now() + failTtlMs); log(`img ${path}: ${err.message}`); const e = new Error('Image unavailable from IPFS gateways.'); e.status = 404; throw e; })
        .finally(() => inflight.delete(key)));
    }
    return inflight.get(key);
  }

  return { get };
}

// Express handler for the regex route /img/ipfs/(<cid>)(/<path>)?
export const IMAGE_ROUTE = /^\/img\/ipfs\/([A-Za-z0-9]{46,100})(?:\/(.*))?$/;
export function imageRoute(proxy) {
  return async (req, res) => {
    const sub = req.params[1] ?? '';
    try {
      const img = await proxy.get(req.params[0], sub);
      res.set({
        'Content-Type': img.type, 'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'cross-origin',
      });
      res.send(img.body);
    } catch (err) {
      res.set('Cache-Control', 'public, max-age=300');
      res.status(err.status ?? 502).json({ error: err.message });
    }
  };
}
