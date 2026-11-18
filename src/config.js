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

  // 🍪 Cookies: Santa's AI credits. Daily allowance, resets 00:00 UTC.
  perks: {
    freeMessagesPerDay: 10, // no wallet
    walletCookiesPerDay: 25, // signed in, not holding (yet)
    tiers: [
      // daily cookie drop by $SANTA held (assumes a 1B supply; edit to taste)
      { name: 'Elf', emoji: '🧝', min: 100_000, cookies: 150 },
      { name: 'Reindeer', emoji: '🦌', min: 1_000_000, cookies: 500 },
      { name: 'North Pole VIP', emoji: '🎅', min: 10_000_000, cookies: 2000 },
    ],
    cost: { message: 1, clip: 100 },
    initialSupply: 1_000_000_000, // for the "burned so far" counter
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
