// Which Elysium launchpads can send a launch's creator fees to a Misthra fee
// router. Compiled 2026-11-08 from the pads' public docs as summarised by a
// third party; nothing here is confirmed on-chain yet. Update `checked` and the
// fields below only from a pad's own docs, its contracts, or its team.
//
//   recipient: 'at-launch'     the creator can name any address when launching
//              'after-launch'  fees can be redirected to any address later
//              'unconfirmed'   docs show fixed choices (me / holders / buyback)
//   delivery:  'push' | 'claim' | 'unknown'  whether fees are sent to the
//              recipient, or must be claimed by it (a router cannot claim
//              without a per-pad adapter)
//   buyback:   whether the router's buyback-and-burn bucket can work there.
//              It swaps on the canonical Uniswap v3 deployment only.
export const PAD_SUPPORT = [
  { id: 'montra', name: 'Montra', recipient: 'at-launch', delivery: 'unknown', buyback: 'unconfirmed', note: 'Creator share can go to another address, such as a multisig.' },
  { id: 'ascend', name: 'Ascend', recipient: 'at-launch', delivery: 'unknown', buyback: 'no', note: '"Vanilla (Creator)" mode sends the creator allocation to a chosen wallet. Pools are Uniswap v4, so buyback-and-burn is not available.' },
  { id: 'pangea', name: 'Pangea', recipient: 'at-launch', delivery: 'unknown', buyback: 'unconfirmed', note: 'The payee launch parameter can be another wallet or a vault.' },
  { id: 'supercolony', name: 'Supercolony', recipient: 'after-launch', delivery: 'unknown', buyback: 'no', note: 'Future fees can be redirected after launch; fees before that go to the creator. Uses its own pool factory and wrapped HYPE.' },
  { id: 'citadel', name: 'Citadel', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Creator rights can be transferred to another wallet. That only works for a router if Citadel sends fees rather than requiring the owner to claim them.' },
  { id: 'kleos', name: 'Kleos', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Fixed choices (creator, holders, buyback) in the docs. Kleos keeps 20%.' },
  { id: 'boxa', name: 'BOXA', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Fixed choices in the docs. BOXA keeps 30%.' },
  { id: 'elyspump', name: 'ElysPump', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Fixed choices in the docs. ElysPump keeps 30%.' },
  { id: 'eleos', name: 'Eleos', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Fixed choices (creator, holders, buyback, liquidity). Eleos keeps 20%.' },
  { id: 'elyxa', name: 'Elyxa', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Fixed choices (creator, buyback, holders).' },
  { id: 'obol', name: 'Obol', recipient: 'unconfirmed', delivery: 'unknown', buyback: 'unconfirmed', note: 'Creator or holders only.' },
];
export const PAD_SUPPORT_CHECKED = { at: '2026-11-08', by: 'public docs via a third-party summary', onchain: false };

// A pad is usable for a router today when any address can receive the fees.
export const usable = (p) => p.recipient === 'at-launch' || p.recipient === 'after-launch';
