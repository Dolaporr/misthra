import test from 'node:test';
import assert from 'node:assert/strict';
import { AbiCoder, id } from 'ethers';
import { abiStrings, imageFromCalldata, normaliseImage } from '../indexer/metadata.mjs';
import real from '../fixtures/montra-launch-tx.json' with { type: 'json' };

const call = (types, values) => id('launch()').slice(0, 10) + AbiCoder.defaultAbiCoder().encode(types, values).slice(2);

test('reads the image from a real mainnet Montra launch transaction', () => {
  assert.ok(abiStrings(real.input).includes('ANSEM'));
  const image = imageFromCalldata(real.input, { name: real.name, symbol: real.symbol });
  assert.match(image, /^https:\/\/images\.pump\.fun\/coin-image\/T8pYCL7/);
});

test('no image unless the call names the token (unrelated calls are ignored)', () => {
  const data = call(['string', 'string', 'string'], ['Other Coin', 'OTHER', 'https://cdn.example.com/a.png']);
  assert.equal(imageFromCalldata(data, { name: 'Mine', symbol: 'MINE' }), null);
  assert.equal(imageFromCalldata(data, { name: 'Other Coin', symbol: 'OTHER' }), 'https://cdn.example.com/a.png');
});

test('missing, invalid and unsafe metadata stays null', () => {
  assert.equal(imageFromCalldata('0x', { name: 'A', symbol: 'A' }), null);
  assert.equal(imageFromCalldata(null, { name: 'A', symbol: 'A' }), null);
  assert.equal(imageFromCalldata(call(['string', 'string'], ['Coin', 'CN']), { name: 'Coin', symbol: 'CN' }), null, 'no URL at all');
  for (const bad of ['http://cdn.example.com/a.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://user:pw@cdn.example.com/a.png', 'https://localhost/a.png', 'ipfs://short']) {
    assert.equal(imageFromCalldata(call(['string', 'string', 'string'], ['Coin', 'CN', bad]), { name: 'Coin', symbol: 'CN' }), null, bad);
  }
  // A metadata JSON URI is not an image; it stays null until JSON resolution exists.
  assert.equal(imageFromCalldata(call(['string', 'string', 'string'], ['Coin', 'CN', 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/metadata.json']), { name: 'Coin', symbol: 'CN' }), null);
  // Garbage bytes that happen to look like a length word don't produce strings.
  assert.deepEqual(abiStrings('0x12345678' + 'ff'.repeat(96)), []);
});

test('ipfs and arweave links are turned into https', () => {
  assert.equal(normaliseImage('ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'), 'https://ipfs.io/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG');
  assert.equal(normaliseImage('ipfs://ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/1.png', { ipfsGateway: 'https://gw.example/' }), 'https://gw.example/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG/1.png');
  assert.equal(normaliseImage('ar://' + 'a'.repeat(43)), 'https://arweave.net/' + 'a'.repeat(43));
  assert.equal(normaliseImage('  https://cdn.example.com/x.webp  '), 'https://cdn.example.com/x.webp');
});
