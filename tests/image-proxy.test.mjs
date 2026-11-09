import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createImageProxy, sniffImage, ipfsPathOk } from '../server/terminal/image-proxy.mjs';
import { withGateway } from '../server/terminal/store.mjs';

const CID = 'bafkreih2pq2qqznbmn6ki5dyv5zoo2cgbullhq56jbhw7at3gixxw5j57e';
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const respond = (status, body) => ({ ok: status === 200, status, body: new Blob([body]).stream() });

test('serves the first gateway that returns a real image, then from disk', async () => {
  const calls = [];
  const fetchImpl = async (url) => { calls.push(url); if (url.startsWith('https://slow')) return respond(504, 'x'); if (url.startsWith('https://html')) return respond(200, '<html>'); return respond(200, PNG); };
  const dir = mkdtempSync(join(tmpdir(), 'img-'));
  const proxy = createImageProxy({ cacheDir: dir, gateways: ['https://slow.example', 'https://html.example', 'https://good.example'], fetchImpl });
  const img = await proxy.get(CID);
  assert.equal(img.type, 'image/png');
  assert.ok(calls.every((u) => u.endsWith(`/ipfs/${CID}`)), 'only IPFS paths on the fixed gateways');
  assert.equal(readdirSync(dir).length, 1);
  calls.length = 0;
  assert.equal((await proxy.get(CID)).type, 'image/png');
  assert.equal(calls.length, 0, 'second request served from cache');
});

test('refuses non-images (SVG, HTML), oversize files and bad paths; remembers failures', async () => {
  let n = 0;
  const svg = createImageProxy({ gateways: ['https://g.example'], fetchImpl: async () => { n += 1; return respond(200, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'); } });
  await assert.rejects(svg.get(CID), (e) => e.status === 404);
  await assert.rejects(svg.get(CID), (e) => e.status === 404);
  assert.equal(n, 1, 'a failed image is not refetched immediately');
  const big = createImageProxy({ gateways: ['https://g.example'], fetchImpl: async () => respond(200, Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)])) });
  await assert.rejects(big.get(CID), (e) => e.status === 404);
  for (const [cid, sub] of [['short', ''], [CID, '../etc/passwd'], [CID, 'a/../../b'], ['../../x' + 'a'.repeat(46), '']]) assert.equal(ipfsPathOk(cid, sub), false, `${cid}/${sub}`);
  assert.equal(ipfsPathOk(CID, 'images/1.png'), true);
  assert.equal(sniffImage(Buffer.from('GIF89a......')), 'image/gif');
  assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?><svg/>')), null);
});

test('API image links go through misthra when PUBLIC_URL is set, any IPFS gateway included', () => {
  for (const host of ['https://ipfs.io', 'https://clankerworld.mypinata.cloud', 'https://gateway.pinata.cloud'])
    assert.equal(withGateway(`${host}/ipfs/${CID}`, 'https://gateway.pinata.cloud', 'https://misthra.com'), `https://misthra.com/api/img/ipfs/${CID}`);
  assert.equal(withGateway(`https://ipfs.io/ipfs/${CID}`, 'https://gateway.pinata.cloud', null), `https://gateway.pinata.cloud/ipfs/${CID}`);
  assert.equal(withGateway('https://images.pump.fun/coin-image/x.png', 'https://gateway.pinata.cloud', 'https://misthra.com'), 'https://images.pump.fun/coin-image/x.png', 'non-IPFS links are untouched');
  assert.equal(withGateway(null, 'https://g', 'https://misthra.com'), null);
});
