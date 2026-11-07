import test from 'node:test';
import assert from 'node:assert/strict';
import { Wallet, keccak256 } from 'ethers';
let chain;
try { chain = await import('../chain/client.mjs'); } catch {}
test('Elysium chain adapter exists', () => assert.equal(typeof chain?.HypeEscrowClient, 'function'));
test('chain configuration never invents a mainnet address or accepts zero contract', { skip: !chain }, () => {
  assert.equal(chain.ELYSIUM_TESTNET.chainId, 99801);
  assert.equal(chain.ELYSIUM_TESTNET.currency, 'HYPE');
  assert.throws(() => new chain.HypeEscrowClient({ contractAddress: '0x' + '0'.repeat(40) }), /contract/i);
  assert.throws(() => new chain.HypeEscrowClient({ contractAddress: Wallet.createRandom().address, rpcUrl: 'http://evil.example' }), /HTTPS|loopback/i);
});
test('transaction preparation refuses a mismatched network or absent contract', { skip: !chain }, async () => {
  const contractAddress = Wallet.createRandom().address;
  const wrong = new chain.HypeEscrowClient({ contractAddress, provider: { getNetwork: async () => ({ chainId: 4663n }), getCode: async () => '0x1234' } });
  await assert.rejects(() => wrong.prepare('deposit', { amount: '1' }), /network|chain/i);
  const empty = new chain.HypeEscrowClient({ contractAddress, provider: { getNetwork: async () => ({ chainId: 99801n }), getCode: async () => '0x' } });
  await assert.rejects(() => empty.prepare('deposit', { amount: '1' }), /deployed/i);
});
test('native HYPE deposit calldata and amount have no CREDIT or Robinhood fallback', { skip: !chain }, async () => {
  const contractAddress = Wallet.createRandom().address;
  const client = new chain.HypeEscrowClient({ contractAddress, provider: { getNetwork: async () => ({ chainId: 99801n }), getCode: async () => '0x1234' } });
  const tx = await client.prepare('deposit', { amount: '0.123456789123456789' });
  assert.equal(tx.to, contractAddress);
  assert.equal(tx.value, '0x1b69b4bacd05f15');
  assert.equal(tx.chainId, '0x185d9');
  assert.equal(client.iface.parseTransaction({ data: tx.data }).name, 'deposit');
  await assert.rejects(() => client.prepare('deposit', { amount: '1e10' }), /amount/i);
});
test('prepared signed actions bind chain, contract, nonce and operation bytes', { skip: !chain }, async () => {
  const actor = Wallet.createRandom().address;
  const contractAddress = Wallet.createRandom().address;
  const provider = { getNetwork: async () => ({ chainId: 99801n }), getCode: async () => '0x1234', getBlock: async () => ({ timestamp: 1700000000 }) };
  const client = new chain.HypeEscrowClient({ contractAddress, provider });
  const prepared = await client.prepareMeta('submit', { id: 7, text: 'Delivered work', resultURI: 'https://example.org/delivery' }, actor);
  assert.equal(prepared.domain.verifyingContract, contractAddress);
  assert.equal(prepared.domain.chainId, 99801);
  assert.equal(prepared.value.kind, 3);
  assert.equal(prepared.value.actor, actor);
  assert.equal(prepared.value.dataHash, keccak256(prepared.data));
  assert.equal(prepared.value.expiry, 1700003600);
  const next = await client.prepareMeta('claim', { id: 7 }, actor);
  assert.notEqual(next.value.nonce, prepared.value.nonce);
});
