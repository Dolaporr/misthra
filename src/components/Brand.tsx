import './brand.css';

export const BRAND = { name: 'Misthra', wordmark: 'misthra', descriptor: 'Fee control for Elysium launches.', x: 'https://x.com/misthraxyz', xHandle: '@misthraxyz' } as const;

export function Brand() {
  return <img className="misthra-logo" src="/brand/misthra-logo.svg" alt={BRAND.name} width={158} height={32}/>;
}
