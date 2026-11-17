// ─────────────────────────────────────────────────────────────────────────────
//  Santa Claude AI: the one file to edit for token + links.
//  Used by the website AND by Santa's chat brain (server/santa.js), so whatever
//  you put here is what Santa will tell people. Leave a field '' if unknown.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE = {
  name: 'Santa Claude AI',
  short: 'Santa Claude',
  ticker: '$SANTA', // TODO: confirm the real ticker
  chain: 'Solana',

  // Paste the mint address here at launch. While empty, the site says
  // "Contract address drops at launch" and Santa will say the same.
  contractAddress: '',

  // Where to buy / track. {ca} is replaced with contractAddress.
  // Links that need the CA stay hidden until it is set.
  links: {
    buy: 'https://jup.ag/swap/SOL-{ca}',
    chart: 'https://dexscreener.com/solana/{ca}',
    explorer: 'https://solscan.io/token/{ca}',
    x: '', // e.g. 'https://x.com/santaclaudeai'
    telegram: '', // e.g. 'https://t.me/santaclaudeai'
  },
};

export function link(key) {
  const url = SITE.links[key] || '';
  if (!url) return '';
  if (url.includes('{ca}')) {
    if (!SITE.contractAddress) return '';
    return url.replaceAll('{ca}', SITE.contractAddress);
  }
  return url;
}
