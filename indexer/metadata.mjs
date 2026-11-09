// Launch artwork from the transaction that created the launch.
//
// Pads such as Montra take the creator's name, symbol and image URL as arguments of the
// launch call, so the image is in the creating transaction's calldata (checked on mainnet,
// 2026-11-09: Montra factory selector 0x579ba2d5 carries name, symbol, image URL). We don't
// rely on any one pad's ABI: we read every ABI-encoded string in the calldata and accept an
// image URL only when the token's own name or symbol is among those strings, which shows the
// call is that token's launch rather than some unrelated call.
//
// We never fetch the URL server-side (no SSRF surface); the browser loads it. Metadata JSON
// URIs (ipfs://…/metadata.json) are not resolved yet, so those launches keep image: null.

const MAX_STRING = 2048;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|avif|svg)(\?|#|$)/i;

// Every ABI-encoded string in the calldata: a 32-byte length word followed by that many
// bytes of valid UTF-8, padded to 32 bytes. Selector is skipped.
export function abiStrings(calldata) {
  const hex = String(calldata ?? '').replace(/^0x/, '').slice(8);
  if (hex.length < 128) return [];
  const words = Math.floor(hex.length / 64);
  const out = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (let i = 0; i < words - 1; i += 1) {
    const len = Number.parseInt(hex.slice(i * 64, i * 64 + 64), 16);
    if (!Number.isSafeInteger(len) || len < 1 || len > MAX_STRING) continue;
    const start = (i + 1) * 64, end = start + len * 2;
    if (end > hex.length) continue;
    // padding after the string must be zero
    const padEnd = start + Math.ceil(len / 32) * 64;
    if (padEnd > hex.length || /[^0]/.test(hex.slice(end, padEnd))) continue;
    const bytes = new Uint8Array(len);
    for (let b = 0; b < len; b += 1) bytes[b] = Number.parseInt(hex.slice(start + b * 2, start + b * 2 + 2), 16);
    let text;
    try { text = decoder.decode(bytes); } catch { continue; }
    if (/[\u0000-\u0008\u000e-\u001f]/.test(text)) continue;
    out.push(text);
  }
  return out;
}

// Accept https, ipfs:// and ar:// only. http (mixed content), data: and javascript: are refused.
export function normaliseImage(raw, { ipfsGateway = 'https://ipfs.io' } = {}) {
  const s = String(raw ?? '').trim();
  if (!s || s.length > MAX_STRING) return null;
  const ipfs = s.match(/^ipfs:\/\/(?:ipfs\/)?([A-Za-z0-9]{46,})(\/[^\s?#]*)?$/);
  if (ipfs) return `${ipfsGateway.replace(/\/+$/, '')}/ipfs/${ipfs[1]}${ipfs[2] ?? ''}`;
  const ar = s.match(/^ar:\/\/([A-Za-z0-9_-]{43})(\/[^\s?#]*)?$/);
  if (ar) return `https://arweave.net/${ar[1]}${ar[2] ?? ''}`;
  let url;
  try { url = new URL(s); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || !url.hostname.includes('.')) return null;
  return url.toString();
}

const looksLikeMetadataJson = (s) => /\.json(\?|#|$)/i.test(s);

// The launch image, or null. `name` and `symbol` are the token's on-chain ERC-20 values.
export function imageFromCalldata(calldata, { name, symbol } = {}, opts = {}) {
  const strings = abiStrings(calldata);
  const ids = [name, symbol].filter((x) => typeof x === 'string' && x.trim().length).map((x) => x.trim());
  if (!ids.length || !strings.some((s) => ids.includes(s.trim()))) return null;
  const candidates = strings.filter((s) => /^(https:\/\/|ipfs:\/\/|ar:\/\/)/i.test(s.trim()) && !looksLikeMetadataJson(s));
  // Prefer something that is plainly an image; otherwise the first acceptable URL.
  const ordered = [...candidates.filter((s) => IMAGE_EXT.test(s) || /image|img|media|cdn|ipfs|arweave/i.test(s)), ...candidates];
  for (const c of ordered) { const n = normaliseImage(c, opts); if (n) return n; }
  return null;
}
