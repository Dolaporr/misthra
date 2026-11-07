import { AbiCoder, Interface, JsonRpcProvider, ZeroAddress, getAddress, hexlify, isAddress, keccak256, parseEther, randomBytes, toQuantity, toUtf8Bytes } from 'ethers';

export const ELYSIUM_TESTNET = Object.freeze({ name: 'Elysium testnet', chainId: 99801, rpcUrl: 'https://testnet-rpc.elysium.kinetiq.xyz', explorerUrl: 'https://testnet.elysium.kinetiq.xyz', currency: 'HYPE' });
const POST = 'tuple(uint256 reward,uint64 deadline,uint64 reviewWindow,uint64 claimTtl,address assignee,bool pickOnly,bool competition,uint8 maxRevisions,bytes32 specHash)';
export const ESCROW_ABI = [
  'function deposit() payable', 'function depositFor(address account) payable', 'function withdraw(uint256 amount,address to)',
  `function post(${POST} params) returns (uint256)`, 'function claim(uint256 id)', 'function assign(uint256 id,address worker)',
  'function submit(uint256 id,string resultURI,bytes32 resultHash)', 'function requestChanges(uint256 id,bytes32 noteHash)',
  'function accept(uint256 id,uint256 tip)', 'function reject(uint256 id)', 'function cancel(uint256 id)', 'function raise(uint256 id,uint256 amount)',
  'function finalize(uint256 id)', 'function expire(uint256 id)', 'function recoverClaim(uint256 id)',
  'function selectWinner(uint256 id,address worker,bytes32 resultHash)', 'function confirmWinner(uint256 id,string resultURI,bytes32 resultHash)',
  'function balanceOf(address account) view returns (uint256)', 'function quote(uint256 reward) pure returns (uint256 net,uint256 fee)',
  'function execute(tuple(address actor,uint8 kind,uint256 id,uint256 amount,address who,bytes32 dataHash,uint256 nonce,uint64 expiry) action,bytes data,bytes signature)',
  'event Posted(uint256 indexed id,address indexed poster,uint256 reward,bytes32 specHash)',
  'event Settled(uint256 indexed id,address indexed worker,uint256 net,uint256 fee,uint256 tip)',
];
export const ACTION_TYPES = Object.freeze({ Action: [
  { name: 'actor', type: 'address' }, { name: 'kind', type: 'uint8' }, { name: 'id', type: 'uint256' }, { name: 'amount', type: 'uint256' },
  { name: 'who', type: 'address' }, { name: 'dataHash', type: 'bytes32' }, { name: 'nonce', type: 'uint256' }, { name: 'expiry', type: 'uint64' },
] });

function money(value, allowZero = false) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value) || value.length > 78) throw new Error('Invalid HYPE amount; use a decimal string with up to 18 decimal places.');
  const atoms = parseEther(value);
  if ((!allowZero && atoms === 0n) || atoms >= 2n ** 256n) throw new Error('Invalid HYPE amount.');
  return atoms;
}
function addr(value) { if (!isAddress(value) || value === ZeroAddress) throw new Error('A nonzero EVM address is required.'); return getAddress(value); }
function integer(value, name) { if (!Number.isSafeInteger(Number(value)) || Number(value) <= 0) throw new Error(`Invalid ${name}.`); return Number(value); }
const coder = AbiCoder.defaultAbiCoder();
const hashText = value => keccak256(toUtf8Bytes(value));

/** Read and prepare transactions only. This adapter never signs or broadcasts. */
export class HypeEscrowClient {
  constructor({ contractAddress, chainId = ELYSIUM_TESTNET.chainId, rpcUrl = ELYSIUM_TESTNET.rpcUrl, provider } = {}) {
    if (!isAddress(contractAddress) || contractAddress === ZeroAddress) throw new Error('Configure a nonzero escrow contract address.');
    this.address = addr(contractAddress);
    this.chainId = integer(chainId, 'chain ID');
    const url = new URL(rpcUrl);
    if (url.username || url.password || !['http:', 'https:'].includes(url.protocol) || (url.protocol === 'http:' && !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) throw new Error('Use HTTPS for RPC, or HTTP on loopback for local EVM testing.');
    this.provider = provider || new JsonRpcProvider(rpcUrl);
    this.iface = new Interface(ESCROW_ABI);
  }

  async checkDeployment() {
    const network = await this.provider.getNetwork();
    if (network.chainId !== BigInt(this.chainId)) throw new Error(`Wrong RPC network: expected chain ${this.chainId}, got ${network.chainId}.`);
    if (await this.provider.getCode(this.address) === '0x') throw new Error('No escrow contract is deployed at the configured address on this network.');
  }

  async payload(action, args = {}) {
    const id = action === 'deposit' || action === 'withdraw' || action === 'post' ? 0 : integer(args.id, 'mission ID');
    const common = { id, amount: 0n, who: ZeroAddress, data: '0x', value: 0n };
    switch (action) {
      case 'deposit': return { ...common, fn: 'deposit', args: [], value: money(args.amount), kind: null };
      case 'withdraw': { const amount = money(args.amount), who = addr(args.to); return { ...common, fn: 'withdraw', args: [amount, who], amount, who, kind: 9 }; }
      case 'post': {
        const spec = { v: 1, title: String(args.title || ''), task: String(args.task || ''), criteria: args.criteria || [], category: args.category || 'custom', output: args.output || 'markdown', competition: args.mode === 'competition' };
        if (spec.title.length < 3 || spec.task.length < 10 || !Array.isArray(spec.criteria) || spec.criteria.length === 0) throw new Error('A title, task and finished criteria are required.');
        const latest = await this.provider.getBlock('latest');
        const hours = integer(args.deadlineHours ?? 24, 'deadline');
        const review = integer(args.reviewHours ?? 24, 'review window');
        const claim = integer(args.claimHours ?? 24, 'claim window');
        const maxRevisions = args.maxRevisions ?? 2;
        if (hours > 8760 || review > 8760 || claim > 8760 || !Number.isInteger(maxRevisions) || maxRevisions < 0 || maxRevisions > 10) throw new Error('Mission windows or revision limit are outside the contract limits.');
        const assignee = args.mode === 'direct' ? addr(args.assignee) : ZeroAddress;
        const params = { reward: money(args.reward), deadline: latest.timestamp + hours * 3600, reviewWindow: review * 3600, claimTtl: claim * 3600, assignee, pickOnly: args.mode === 'competition' || args.mode === 'direct', competition: args.mode === 'competition', maxRevisions, specHash: hashText(JSON.stringify(spec)) };
        return { ...common, fn: 'post', args: [params], kind: 0, data: coder.encode([POST], [params]), spec };
      }
      case 'claim': return { ...common, fn: 'claim', args: [id], kind: 1 };
      case 'assign': { const who = addr(args.worker); return { ...common, fn: 'assign', args: [id, who], who, kind: 2 }; }
      case 'submit': case 'confirm': {
        if (typeof args.text !== 'string' || !args.text.trim()) throw new Error('Delivery text is required.');
        const resultURI = args.resultURI || `data:text/markdown;base64,${Buffer.from(args.text).toString('base64')}`;
        if (typeof resultURI !== 'string' || !/^(https:\/\/|ipfs:\/\/|data:text\/markdown;base64,)/.test(resultURI) || Buffer.byteLength(resultURI) > 2048) throw new Error('Delivery URI must be HTTPS, IPFS or a short markdown data URI (2048 bytes max). Host longer deliveries and supply resultURI.');
        const resultHash = hashText(args.text);
        return { ...common, fn: action === 'submit' ? 'submit' : 'confirmWinner', args: [id, resultURI, resultHash], kind: action === 'submit' ? 3 : 11, data: coder.encode(['string', 'bytes32'], [resultURI, resultHash]) };
      }
      case 'revise': {
        if (typeof args.note !== 'string' || !args.note.trim()) throw new Error('A revision note is required.');
        const noteHash = hashText(args.note); return { ...common, fn: 'requestChanges', args: [id, noteHash], kind: 4, data: coder.encode(['bytes32'], [noteHash]) };
      }
      case 'accept': { const tip = money(args.tip || '0', true); return { ...common, fn: 'accept', args: [id, tip], amount: tip, kind: 5 }; }
      case 'reject': return { ...common, fn: 'reject', args: [id], kind: 6 };
      case 'cancel': return { ...common, fn: 'cancel', args: [id], kind: 7 };
      case 'raise': { const amount = money(args.amount); return { ...common, fn: 'raise', args: [id, amount], amount, kind: 8 }; }
      case 'pick': {
        const who = addr(args.worker);
        if (typeof args.text !== 'string' || !args.text.trim()) throw new Error('The selected entry text is required to bind its hash.');
        const resultHash = hashText(args.text); return { ...common, fn: 'selectWinner', args: [id, who, resultHash], who, kind: 10, data: coder.encode(['bytes32'], [resultHash]) };
      }
      case 'finalize': case 'expire': case 'recoverClaim': return { ...common, fn: action, args: [id], kind: null };
      default: throw new Error('Unsupported escrow action.');
    }
  }

  async prepare(action, args) {
    await this.checkDeployment();
    const payload = await this.payload(action, args);
    return { to: this.address, chainId: toQuantity(this.chainId), value: toQuantity(payload.value), data: this.iface.encodeFunctionData(payload.fn, payload.args) };
  }

  async prepareMeta(action, args, actor) {
    await this.checkDeployment();
    const payload = await this.payload(action, args);
    if (payload.kind === null) throw new Error('This action uses a direct transaction, not a signed meta-action.');
    const latest = await this.provider.getBlock('latest');
    return {
      domain: { name: 'ErrandBoard', version: '1', chainId: this.chainId, verifyingContract: this.address },
      types: ACTION_TYPES,
      value: { actor: addr(actor), kind: payload.kind, id: payload.id.toString(), amount: payload.amount.toString(), who: payload.who, dataHash: keccak256(payload.data), nonce: BigInt(hexlify(randomBytes(16))).toString(), expiry: latest.timestamp + 3600 },
      data: payload.data,
      ...(payload.spec ? { spec: payload.spec } : {}),
    };
  }
}
