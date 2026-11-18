import './style.css';
import { SITE, link } from './config.js';
import { initChat } from './chat.js';
import { initAscii } from './ascii.js';
import { initFx } from './fx.js';
import { initSplash } from './splash.js';
import { initLive } from './live.js';
import { initHolders } from './holders.js';
import { getPrefs, setPrefs, onPrefs, unlock, start } from './sound.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (reduced) document.documentElement.classList.add('reduced');

// ── config → page ───────────────────────────────────────
$$('[data-ticker]').forEach((el) => (el.textContent = SITE.ticker));
$$('[data-chain]').forEach((el) => (el.textContent = SITE.chain));

const buy = link('buy');
$$('[data-buy]').forEach((a) => {
  if (!buy) return;
  a.href = buy;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
});

$$('[data-link]').forEach((a) => {
  const url = link(a.dataset.link);
  if (url) {
    a.href = url;
    a.hidden = false;
  } else {
    a.hidden = true;
    a.closest('[data-link-li]')?.setAttribute('hidden', '');
  }
});
const community = $('[data-community]');
if (community && !link('x') && !link('telegram')) community.hidden = true;

const ca = SITE.contractAddress;
const caEl = $('[data-ca]');
const copyBtn = $('[data-copy]');
if (ca) {
  caEl.innerHTML = '';
  const full = document.createElement('span');
  full.className = 'full';
  full.textContent = ca;
  const short = document.createElement('span');
  short.className = 'short';
  short.textContent = `${ca.slice(0, 6)}…${ca.slice(-6)}`;
  caEl.append(full, short);
  copyBtn.hidden = false;
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(ca);
      copyBtn.textContent = 'Copied ✓';
    } catch {
      const r = document.createRange();
      r.selectNodeContents(full);
      getSelection().removeAllRanges();
      getSelection().addRange(r);
      copyBtn.textContent = 'Select + copy';
    }
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1800);
  });
  $$('[data-token-status]').forEach((el) => (el.innerHTML = '<i class="dot on"></i>live'));
  $$('[data-token-status-short]').forEach((el) => (el.textContent = 'Live'));
} else {
  caEl.classList.add('empty');
}

// ── atmosphere + splash ─────────────────────────────────
let fx = null;
try {
  fx = initFx({ reduced });
} catch (e) {
  console.error('fx failed', e);
}
try {
  initSplash({ reduced, fx });
} catch (e) {
  // never leave visitors stuck behind a broken splash
  console.error('splash failed', e);
  document.getElementById('splash')?.remove();
  document.documentElement.classList.remove('splashing');
  queueMicrotask(() => window.dispatchEvent(new Event('santa:entered')));
}

// header sound toggle (music + sound effects)
const sndBtn = $('[data-sound]');
const renderSnd = (p) => {
  sndBtn.setAttribute('aria-pressed', String(p.music));
  sndBtn.classList.toggle('muted', !p.music);
};
renderSnd(getPrefs());
onPrefs(renderSnd);
sndBtn.addEventListener('click', () => {
  unlock();
  setPrefs({ music: !getPrefs().music });
  start();
});

// ── reveal on scroll (+ typed eyebrows) ─────────────────
function typeOut(el) {
  const text = el.textContent;
  if (!text || reduced) return;
  el.textContent = '';
  el.classList.add('typing-on');
  let i = 0;
  const step = () => {
    el.textContent = text.slice(0, ++i);
    if (i < text.length) setTimeout(step, 22);
    else el.classList.remove('typing-on');
  };
  step();
}
const rv = $$('[data-rv]');
if (reduced || !('IntersectionObserver' in window)) {
  rv.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        if (e.target.classList.contains('eyebrow')) typeOut(e.target);
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  const watch = () =>
    rv.forEach((el, i) => {
      el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
      io.observe(el);
    });
  // let the hero animate in when the splash lifts, not behind it
  if (document.documentElement.classList.contains('splashing')) window.addEventListener('santa:entered', watch, { once: true });
  else watch();
}

initLive($('[data-live-root]'));
try {
  initHolders();
} catch (e) {
  console.error('holders failed', e);
}

// ── chat + ascii ────────────────────────────────────────
initChat($('#talk'));
initAscii($('[data-ascii]'), $('[data-ascii-count]'), { reduced });

// ── 3D stage (three.js loads in its own chunk) ──────────
const stageEl = $('[data-stage]');
const loadEl = $('[data-load]');
const pctEl = $('[data-load-pct]');
$$('[data-clip]', stageEl).forEach((b) =>
  b.addEventListener('click', () => window.dispatchEvent(new CustomEvent('santa:act', { detail: b.dataset.clip }))),
);

import('./stage.js')
  .then(({ initStage }) =>
    initStage(stageEl, {
      reduced,
      onProgress: (p) => {
        pctEl.textContent = `${Math.round(p * 100)}%`;
        window.dispatchEvent(new CustomEvent('santa:progress', { detail: p }));
      },
      onReady: () => {
        stageEl.classList.add('ready');
        window.dispatchEvent(new Event('santa:ready'));
      },
      onError: () => {
        window.dispatchEvent(new Event('santa:3d-failed'));
        loadEl.textContent = 'Santa is shy today: 3D needs WebGL';
        $('[data-poster]').style.opacity = '1';
        $('.clips', stageEl).hidden = true;
      },
    }),
  )
  .catch(() => {
    loadEl.hidden = true;
    window.dispatchEvent(new Event('santa:3d-failed'));
  });
