// Live $SANTA numbers from DexScreener (public API, no key). Shows placeholders
// until SITE.contractAddress is set, then refreshes every 30 seconds.
import { SITE } from './config.js';

const fmtUsd = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
};
const fmtPrice = (n) => {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1) return `$${n.toFixed(4)}`;
  // small memecoin prices: keep 4 significant digits
  return `$${n.toPrecision(4).replace(/e-(\d+)/, (_, e) => `e-${e}`)}`;
};

export function initLive(root) {
  if (!root) return;
  const set = (k, v, cls) => {
    const el = root.querySelector(`[data-live="${k}"]`);
    if (!el) return;
    el.textContent = v;
    if (cls !== undefined) el.className = cls;
  };
  const ca = SITE.contractAddress;
  if (!ca) {
    root.classList.add('pre');
    return;
  }

  let timer = 0;
  async function load() {
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${encodeURIComponent(ca)}`, { credentials: 'omit' });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      const pairs = (data.pairs || []).filter((p) => p.chainId === 'solana');
      if (!pairs.length) throw new Error('no pairs yet');
      const p = pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      const ch = Number(p.priceChange?.h24);
      set('price', fmtPrice(Number(p.priceUsd)));
      set('change', Number.isFinite(ch) ? `${ch > 0 ? '+' : ''}${ch.toFixed(1)}% 24h` : '', `chg ${ch >= 0 ? 'up' : 'down'}`);
      set('mcap', fmtUsd(Number(p.marketCap ?? p.fdv)));
      set('vol', fmtUsd(Number(p.volume?.h24)));
      set('liq', fmtUsd(Number(p.liquidity?.usd)));
      set('updated', `updated ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
      root.classList.remove('pre');
      root.classList.add('on');
    } catch {
      set('updated', 'waiting for the first trades…');
    }
  }
  const tick = () => {
    clearTimeout(timer);
    if (document.visibilityState === 'visible') load();
    timer = setTimeout(tick, 30000);
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && tick());
  tick();
}
