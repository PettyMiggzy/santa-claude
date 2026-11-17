import './style.css';
import { SITE, link } from './config.js';
import { initChat } from './chat.js';
import { initAscii } from './ascii.js';

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

// ── reveal on scroll ────────────────────────────────────
const rv = $$('[data-rv]');
if (reduced || !('IntersectionObserver' in window)) {
  rv.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px' },
  );
  rv.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i % 4, 3) * 70}ms`;
    io.observe(el);
  });
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
      onProgress: (p) => (pctEl.textContent = `${Math.round(p * 100)}%`),
      onReady: () => stageEl.classList.add('ready'),
      onError: () => {
        loadEl.textContent = 'Santa is shy today: 3D needs WebGL';
        $('[data-poster]').style.opacity = '1';
        $('.clips', stageEl).hidden = true;
      },
    }),
  )
  .catch(() => {
    loadEl.hidden = true;
  });
