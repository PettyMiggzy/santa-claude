// Holders: wallet sign-in, cookies 🍪, tiers, burn counter, and Santa Clips.
import { SITE } from './config.js';
import { sfx, unlock } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;

let me = null;
const subs = new Set();
export const onMe = (fn) => (subs.add(fn), me && fn(me));
const emit = () => subs.forEach((fn) => fn(me));

export async function refreshMe() {
  try {
    const r = await fetch('/api/me', { credentials: 'same-origin' });
    if (r.ok) {
      me = await r.json();
      emit();
    }
  } catch {
    /* offline */
  }
  return me;
}

// ── wallet ───────────────────────────────────────────────
function provider() {
  const w = window;
  return w.phantom?.solana || w.solflare || w.backpack?.solana || w.backpack || (w.solana?.connect ? w.solana : null);
}

function b64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function noWalletHelp() {
  const here = encodeURIComponent(location.href);
  const ref = encodeURIComponent(location.origin);
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const dlg = $('[data-wallet-help]');
  $('[data-open-phantom]', dlg).href = `https://phantom.app/ul/browse/${here}?ref=${ref}`;
  $('[data-open-solflare]', dlg).href = `https://solflare.com/ul/v1/browse/${here}?ref=${ref}`;
  $('[data-wallet-help-text]', dlg).textContent = mobile
    ? 'Open this site inside your wallet app to sign in:'
    : 'Install a Solana wallet (Phantom, Solflare or Backpack), then come back and sign in. On your phone? Open the site in your wallet app:';
  dlg.showModal?.();
}

export async function signIn() {
  unlock();
  const p = provider();
  if (!p) return noWalletHelp();
  try {
    const res = await p.connect();
    const address = (res?.publicKey || p.publicKey).toString();
    const { nonce, issued } = await (await fetch('/api/auth')).json();
    const message = `${SITE.name} wants you to sign in with your Solana wallet:\n${address}\n\nThis only proves you own this wallet. It is free and moves no funds.\n\nNonce: ${nonce}\nIssued At: ${issued}`;
    const signed = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    const sig = signed?.signature || signed;
    const r = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, nonce, issued, signature: b64(new Uint8Array(sig)) }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Sign-in failed');
    sfx('bells');
    await refreshMe();
  } catch (e) {
    if (!/reject|cancel|denied/i.test(e?.message || '')) alert(e?.message || 'Sign-in failed');
  }
}

export async function signOut() {
  await fetch('/api/auth', { method: 'DELETE' });
  try {
    await provider()?.disconnect?.();
  } catch {
    /* fine */
  }
  await refreshMe();
}

// ── page wiring ──────────────────────────────────────────
export function initHolders() {
  const P = SITE.perks;

  // tiers table
  const tiersEl = $('[data-tiers]');
  if (tiersEl) {
    const rows = [
      { emoji: '🌨️', name: 'Visitor', need: 'no wallet', daily: `${P.freeMessagesPerDay} messages` },
      { emoji: '🔑', name: 'Wallet', need: 'signed in', daily: `${P.walletCookiesPerDay} 🍪` },
      ...P.tiers.map((t) => ({ emoji: t.emoji, name: t.name, need: `${fmt(t.min)} ${SITE.ticker}`, daily: `${fmt(t.cookies)} 🍪` })),
    ];
    tiersEl.innerHTML = '';
    for (const r of rows) {
      const li = document.createElement('li');
      li.dataset.tier = r.name;
      const a = document.createElement('span');
      a.className = 'tier-name';
      a.textContent = `${r.emoji} ${r.name}`;
      const b = document.createElement('span');
      b.className = 'mono-sm';
      b.textContent = r.need;
      const c = document.createElement('b');
      c.textContent = r.daily;
      li.append(a, b, c);
      tiersEl.appendChild(li);
    }
  }
  $$('[data-cost-message]').forEach((el) => (el.textContent = P.cost.message));
  $$('[data-cost-clip]').forEach((el) => (el.textContent = P.cost.clip));

  // header + perks status
  $$('[data-signin]').forEach((b) => b.addEventListener('click', signIn));
  $$('[data-signout]').forEach((b) => b.addEventListener('click', signOut));
  onMe((m) => {
    const chip = $('[data-me-chip]');
    const btn = $('[data-signin-header]');
    if (m.signedIn) {
      chip.hidden = false;
      btn.hidden = true;
      $('[data-me-cookies]').textContent = fmt(m.left);
      $('[data-me-addr]').textContent = short(m.address);
    } else {
      chip.hidden = true;
      btn.hidden = false;
    }
    const st = $('[data-perk-status]');
    if (st) {
      st.textContent = m.signedIn
        ? `${short(m.address)} · ${m.tier ? `${m.tier} · ` : ''}${fmt(m.holding || 0)} ${SITE.ticker} · ${fmt(m.left)}/${fmt(m.allowance)} 🍪 left today`
        : `Not signed in · ${m.left}/${m.allowance} free messages left today`;
    }
    $$('[data-tiers] li').forEach((li) => li.classList.toggle('on', li.dataset.tier === (m.tier || (m.signedIn ? 'Wallet' : 'Visitor'))));
    $$('[data-when-in]').forEach((el) => (el.hidden = !m.signedIn));
    $$('[data-when-out]').forEach((el) => (el.hidden = m.signedIn));
    const burnEl = $('[data-burned]');
    if (burnEl) burnEl.textContent = m.burn ? `${fmt(m.burn.burned)} ${SITE.ticker}` : 'at launch';
    const q = $('[data-quota]');
    if (q) q.textContent = m.signedIn ? `${fmt(m.left)} 🍪 left today` : `${m.left} free messages left today`;
  });

  initClips();
  refreshMe();
  window.addEventListener('santa:spent', refreshMe);
  window.addEventListener('santa:signin', signIn);
}

// ── Santa Clips ──────────────────────────────────────────
function initClips() {
  const root = $('#clips');
  if (!root) return;
  const form = $('[data-clip-form]', root);
  const input = $('textarea', form);
  const go = $('[data-clip-go]', root);
  const status = $('[data-clip-status]', root);
  const bar = $('[data-clip-bar]', root);
  const out = $('[data-clip-out]', root);
  let busy = false;

  $('[data-clip-ideas]', root)?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) input.value = b.textContent;
  });

  const setStatus = (t, p) => {
    status.textContent = t;
    bar.style.width = `${Math.round((p || 0) * 100)}%`;
    bar.parentElement.hidden = p == null;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!me?.signedIn) return signIn();
    busy = true;
    go.disabled = true;
    setStatus('Sending the camera crew to the North Pole…', 0.02);
    try {
      const r = await fetch('/api/clip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: input.value }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Could not start the clip');
      window.dispatchEvent(new Event('santa:spent'));
      const started = Date.now();
      for (;;) {
        await new Promise((s) => setTimeout(s, 4000));
        const s = await (await fetch(`/api/clip?id=${encodeURIComponent(j.id)}`)).json();
        if (s.status === 'done') break;
        if (s.status === 'failed') throw new Error(s.error);
        if (Date.now() - started > 8 * 60000) throw new Error('This one is taking long. Check back in a bit.');
        setStatus('Filming Santa…', Math.max(0.05, s.progress || 0));
      }
      const src = `/api/clip?id=${encodeURIComponent(j.id)}&file=1`;
      const fig = document.createElement('figure');
      fig.className = 'clip-card';
      const v = document.createElement('video');
      v.src = src;
      v.controls = true;
      v.playsInline = true;
      v.loop = true;
      v.autoplay = true;
      const cap = document.createElement('figcaption');
      cap.className = 'mono-sm';
      const t = document.createElement('span');
      t.textContent = input.value;
      const a = document.createElement('a');
      a.href = src;
      a.download = 'santa-clip.mp4';
      a.className = 'link';
      a.textContent = 'Download';
      cap.append(t, a);
      fig.append(v, cap);
      out.prepend(fig);
      sfx('nice');
      setStatus('Your clip is ready! Post it and tag us.', null);
    } catch (err) {
      setStatus(err.message, null);
      window.dispatchEvent(new Event('santa:spent'));
    } finally {
      busy = false;
      go.disabled = false;
    }
  });
}
