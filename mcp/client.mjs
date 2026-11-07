import { Wallet } from 'ethers';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export function loadWallet({ privateKey, file = resolve('data/agent-wallet.json') } = {}) {
  if (privateKey) return new Wallet(privateKey);
  if (existsSync(file)) {
    chmodSync(file, 0o600);
    return new Wallet(JSON.parse(readFileSync(file, 'utf8')).privateKey);
  }
  const wallet = Wallet.createRandom();
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  try {
    writeFileSync(file, JSON.stringify({ address: wallet.address, privateKey: wallet.privateKey }, null, 2), { mode: 0o600, flag: 'wx' });
    return wallet;
  } catch (error) {
    if (error.code === 'EEXIST') return new Wallet(JSON.parse(readFileSync(file, 'utf8')).privateKey);
    throw error;
  }
}

export class ErrandClient {
  constructor({ baseUrl = 'http://127.0.0.1:4317', wallet, token, fetchImpl = fetch } = {}) {
    const parsed = new URL(baseUrl);
    const loopback = ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
    if (!['http:', 'https:'].includes(parsed.protocol) || (parsed.protocol === 'http:' && !loopback) || parsed.username || parsed.password || parsed.search || parsed.hash || parsed.pathname !== '/') {
      throw new Error('ERRAND_SITE must be an HTTPS origin, or an HTTP loopback origin for local development, without credentials, paths or query parameters.');
    }
    this.baseUrl = parsed.origin;
    this.wallet = wallet;
    this.token = token;
    this.fetch = fetchImpl;
  }

  async raw(path, options = {}) {
    if (!path.startsWith('/api/') || path.includes('..')) throw new Error('Only this marketplace API can be called.');
    const response = await this.fetch(this.baseUrl + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const data = await response.json().catch(() => ({ error: 'The marketplace returned an unreadable response.' }));
    if (!response.ok) {
      const error = new Error(data.error || `Marketplace request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  async authenticate() {
    if (!this.wallet) throw new Error('This tool needs an agent wallet. Configure ERRAND_KEY or ERRAND_WALLET.');
    const address = this.wallet.address.toLowerCase();
    const challenge = await this.raw('/api/auth/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address }) });
    if (typeof challenge.message !== 'string' || !challenge.message.startsWith('Errand for Elysium sign-in\n') || !challenge.message.toLowerCase().includes(address) || !challenge.nonce) {
      throw new Error('The marketplace did not return an expected Errand sign-in challenge.');
    }
    const signature = await this.wallet.signMessage(challenge.message);
    const auth = await this.raw('/api/auth/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address, nonce: challenge.nonce, signature }) });
    if (!auth.token || String(auth.address).toLowerCase() !== address) throw new Error('The marketplace returned a session for the wrong account.');
    this.token = auth.token;
    return auth;
  }

  async request(path, { method = 'GET', body, auth = true } = {}) {
    if (!['GET', 'POST'].includes(method)) throw new Error('HTTP method not allowed by this client.');
    if (auth && !this.token) await this.authenticate();
    const run = () => this.raw(path, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(auth ? { Authorization: `Bearer ${this.token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    try { return await run(); } catch (error) {
      if (error.status !== 401 || !auth) throw error;
      this.token = null;
      await this.authenticate();
      return run();
    }
  }
}
