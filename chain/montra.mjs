// Montra on Elysium: ABIs (from montramarkets.xyz/docs/reference, checked against a real
// mainnet launch's calldata, fixtures/montra-launch-tx.json) and the builder-code suffix.
import { Interface, getAddress, isAddress, toUtf8Bytes, hexlify } from 'ethers';

const SOCIALS = '(string telegram,string twitter,string discord,string website,string extra)';
const PROFILE = `(string logo,string description,${SOCIALS} socials)`;
const PERMIT = '(uint256 deadline,uint8 v,bytes32 r,bytes32 s)';
export const LAUNCH_PARAMS = `(string name,string symbol,string metadataURI,${PROFILE} profile,uint256 configId,uint256 supply,bytes32 salt,address[] feeRecipients,uint16[] feeShares,uint256 firstBuyAmount,uint256 firstBuyMinOut,${PERMIT} permit)`;
const LAUNCH_CONFIG = '(uint256 moduleSetId,address quote,uint256 baseSupply,int24 tickSpacing,int24 startTick,uint24 graduationTicks,uint24 lpLineTicks,uint24 totalFeePips,uint24 totalFeeMinPips,uint24 protocolFeePips,uint24 lpFeePips,uint24 earlyBuyFeeStartPips,uint32 earlyBuyFeeWindow,address liquidityPolicy,bool liquiditySealed,uint32 streamDuration,uint16 pushBountyBps,uint128 pushFloor,bool enabled,bool exists)';

export const montraFactoryAbi = new Interface([
  `function launch(${LAUNCH_PARAMS} params) payable returns (address token, bytes32 poolId)`,
  'function predictTokenAddress(address sender, bytes32 salt, uint256 configId) view returns (address)',
  'function configCount() view returns (uint256)',
  `function getConfig(uint256 id) view returns (${LAUNCH_CONFIG} cfg)`,
  'function getModuleSet(uint256 id) view returns ((address hook,address tokenMaster,address splitterMaster,bool exists) mods)',
  'function launchFee() view returns (uint256)',
  'function launchEnabled() view returns (bool)',
]);
export const LAUNCH_SELECTOR = '0x579ba2d5';

export const montraHookAbi = new Interface([
  'function updateRecipient(bytes32 poolId, address newRecipient)',
  'function claim(bytes32 poolId, address to) returns (uint256 amount)',
]);
export const montraTokenAbi = new Interface([
  'function creator() view returns (address)',
  'function hook() view returns (address)',
  'function poolId() view returns (bytes32)',
]);
export const adapterFactoryAbi = new Interface([
  'function predict(address router) view returns (address)',
  'function activate(address router, address token, address quote) returns (address adapter)',
  'function hook() view returns (address)',
  'function tokenMaster() view returns (address)',
]);
export const adapterAbi = new Interface([
  'function collectAndForward() returns (uint256 amount)',
  'function router() view returns (address)',
  'function subject() view returns (address)',
  'function poolId() view returns (bytes32)',
]);

// Montra Builders attribution: the code's ASCII, its length in one byte, schema 00, then the
// 16-byte ERC-8021 marker, appended after the factory call's calldata
// (montramarkets.xyz/docs/builders#attributing-a-launch). Code rule: ^[a-z0-9][a-z0-9-]{2,31}$.
export const BUILDER_CODE = /^[a-z0-9][a-z0-9-]{2,31}$/;
export const ERC8021_MARKER = '80218021802180218021802180218021';
export function builderSuffix(code) {
  if (!BUILDER_CODE.test(code ?? '')) throw new Error(`Invalid Montra builder code: ${code}`);
  const ascii = hexlify(toUtf8Bytes(code)).slice(2);
  return ascii + code.length.toString(16).padStart(2, '0') + '00' + ERC8021_MARKER;
}

export function loadMontraLaunchConfig(env = process.env) {
  const a = (v) => (v && isAddress(v.toLowerCase()) ? getAddress(v.toLowerCase()) : null);
  const factory = a(env.ELYSIUM_MONTRA_FACTORY), adapterFactory = a(env.MISTHRA_MONTRA_ADAPTER_FACTORY);
  const code = (env.MONTRA_BUILDER_CODE || '').trim();
  return {
    factory, adapterFactory, hook: a(env.ELYSIUM_MONTRA_HOOK),
    builderCode: BUILDER_CODE.test(code) ? code : null,
    ready: Boolean(factory && adapterFactory),
  };
}
