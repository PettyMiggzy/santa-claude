// Atmosphere: page-wide snow (parallax, drifts away from the cursor), a sparkle
// trail + snow burst for the cursor, a candy-cane cursor, and the neon sleigh
// flying across the sky now and then. Calm and sparse with reduced motion.
import { sfx } from './sound.js';

const CANE = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><defs><pattern id="s" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(40)"><rect width="5" height="5" fill="#fff"/><rect width="2.3" height="5" fill="#ff2e4d"/></pattern></defs><path d="M4 3v19.5l5.6-5.1 3.6 8.1 3.7-1.6-3.6-7.9 7.7-.3z" fill="none" stroke="#2ff5d4" stroke-opacity=".55" stroke-width="4" stroke-linejoin="round"/><path d="M4 3v19.5l5.6-5.1 3.6 8.1 3.7-1.6-3.6-7.9 7.7-.3z" fill="url(#s)" stroke="#06121c" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
const POINT = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><path d="M4 3v19.5l5.6-5.1 3.6 8.1 3.7-1.6-3.6-7.9 7.7-.3z" fill="none" stroke="#2ff5d4" stroke-opacity=".6" stroke-width="4.5" stroke-linejoin="round"/><path d="M4 3v19.5l5.6-5.1 3.6 8.1 3.7-1.6-3.6-7.9 7.7-.3z" fill="#2ff5d4" stroke="#06121c" stroke-width="1.5" stroke-linejoin="round"/><path d="M23 2l1.1 2.7L27 6l-2.9 1.1L23 10l-1.1-2.9L19 6l2.9-1.3z" fill="#fff"/></svg>`;

export function initFx({ reduced = false } = {}) {
  const fine = matchMedia('(pointer: fine)').matches;
  const root = document.documentElement;

  if (fine) {
    const u = (svg) => `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 3`;
    root.style.setProperty('--cur', `${u(CANE)}, auto`);
    root.style.setProperty('--cur-point', `${u(POINT)}, pointer`);
    root.classList.add('cursor-fx');
  }

  // ── canvases: snow behind the content, sparkles on top ─────
  const makeCanvas = (cls) => {
    const c = document.createElement('canvas');
    c.className = `fx ${cls}`;
    c.setAttribute('aria-hidden', 'true');
    document.body.appendChild(c);
    return c;
  };
  const canvas = makeCanvas('fx-snow');
  const top = makeCanvas('fx-top');
  const snowCtx = canvas.getContext('2d');
  const ctx = top.getContext('2d'); // sparkles
  let W = 0;
  let H = 0;
  let dpr = 1;
  const flakes = [];
  const sparks = [];

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    W = window.innerWidth;
    H = window.innerHeight;
    for (const c of [canvas, top]) {
      c.width = Math.round(W * dpr);
      c.height = Math.round(H * dpr);
    }
    const want = reduced ? 40 : Math.min(260, Math.round((W * H) / 7000));
    while (flakes.length < want) flakes.push(flake(true));
    flakes.length = want;
  }
  function flake(anywhere) {
    const d = 0.25 + Math.random() * 0.75; // depth: far (small, slow) → near
    return {
      x: Math.random() * W,
      y: anywhere ? Math.random() * H : -10,
      r: 0.5 + d * 2.2,
      d,
      vy: 14 + d * 46,
      ph: Math.random() * 6.28,
      sw: 0.4 + Math.random() * 0.9,
      a: 0.25 + d * 0.6,
    };
  }
  size();
  window.addEventListener('resize', size);

  // ── cursor ──────────────────────────────────────────
  const mouse = { x: -999, y: -999, vx: 0, vy: 0, t: 0 };
  let lastEmit = 0;
  if (fine && !reduced) {
    window.addEventListener(
      'pointermove',
      (e) => {
        if (e.pointerType !== 'mouse') return;
        const now = performance.now();
        mouse.vx = e.clientX - mouse.x;
        mouse.vy = e.clientY - mouse.y;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.t = now;
        const dist = Math.hypot(mouse.vx, mouse.vy);
        if (now - lastEmit > 16 && dist > 2 && dist < 300) {
          lastEmit = now;
          spark(e.clientX, e.clientY, 0.5, 1);
        }
      },
      { passive: true },
    );
  }
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (reduced) return;
      for (let i = 0; i < 16; i++) spark(e.clientX, e.clientY, 2.6, 0, true);
      if (e.target.closest?.('button, a, .pill')) sfx('click');
    },
    { passive: true },
  );

  function spark(x, y, speed, drift, burst = false) {
    const ang = Math.random() * Math.PI * 2;
    const v = (burst ? 60 + Math.random() * 140 : 10 + Math.random() * 25) * speed;
    sparks.push({
      x,
      y,
      vx: Math.cos(ang) * v + (drift ? -mouse.vx * 0.6 : 0),
      vy: Math.sin(ang) * v + (burst ? -40 : 18),
      life: 0,
      max: burst ? 0.9 + Math.random() * 0.5 : 0.6 + Math.random() * 0.4,
      s: burst ? 1.6 + Math.random() * 2.4 : 1 + Math.random() * 1.8,
      c: Math.random() < 0.6 ? '#dffcff' : Math.random() < 0.7 ? '#2ff5d4' : '#ff5a72',
      star: burst ? Math.random() < 0.6 : Math.random() < 0.35,
    });
    if (sparks.length > 400) sparks.splice(0, sparks.length - 400);
  }

  function drawStar(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y - s * 2.2);
    ctx.lineTo(x + s * 0.5, y - s * 0.5);
    ctx.lineTo(x + s * 2.2, y);
    ctx.lineTo(x + s * 0.5, y + s * 0.5);
    ctx.lineTo(x, y + s * 2.2);
    ctx.lineTo(x - s * 0.5, y + s * 0.5);
    ctx.lineTo(x - s * 2.2, y);
    ctx.lineTo(x - s * 0.5, y - s * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  // ── loop ────────────────────────────────────────────
  let last = performance.now();
  let t = 0;
  let raf = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;
    snowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    snowCtx.clearRect(0, 0, W, H);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const wind = Math.sin(t * 0.13) * 14 + Math.sin(t * 0.041) * 9;
    snowCtx.fillStyle = '#ffffff';
    for (const f of flakes) {
      f.y += f.vy * dt;
      f.x += (wind * f.d + Math.sin(t * f.sw + f.ph) * 10 * f.d) * dt;
      // drift away from the cursor
      const dx = f.x - mouse.x;
      const dy = f.y - mouse.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 9000) {
        const k = (1 - d2 / 9000) * 120 * dt;
        const inv = 1 / Math.sqrt(d2 || 1);
        f.x += dx * inv * k;
        f.y += dy * inv * k * 0.5;
      }
      if (f.y > H + 6) Object.assign(f, flake(false), { x: Math.random() * W });
      if (f.x > W + 6) f.x = -6;
      else if (f.x < -6) f.x = W + 6;
      snowCtx.globalAlpha = f.a;
      snowCtx.beginPath();
      snowCtx.arc(f.x, f.y, f.r, 0, 6.283);
      snowCtx.fill();
    }
    snowCtx.globalAlpha = 1;

    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.life += dt;
      if (p.life >= p.max) {
        sparks.splice(i, 1);
        continue;
      }
      p.vx *= 0.96;
      p.vy = p.vy * 0.96 + 60 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const k = 1 - p.life / p.max;
      ctx.globalAlpha = k;
      ctx.fillStyle = p.c;
      if (p.star) drawStar(p.x, p.y, p.s * (0.6 + k * 0.6));
      else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.s * k + 0.4, 0, 6.283);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
  const run = () => {
    cancelAnimationFrame(raf);
    if (document.visibilityState === 'visible') {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    }
  };
  document.addEventListener('visibilitychange', run);
  run();

  // ── the sky: parallax + darker as you scroll, sleigh flyovers ────────
  const world = document.querySelector('[data-world]');
  const shade = document.querySelector('[data-world-shade]');
  const img = document.querySelector('[data-world-img]');
  let ticking = false;
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const y = window.scrollY;
      const k = Math.min(1, y / (window.innerHeight * 1.2));
      if (shade) shade.style.opacity = String(0.35 + k * 0.5);
      if (img && !reduced) img.style.transform = `translate3d(0, ${(-y * 0.04).toFixed(1)}px, 0) scale(1.06)`;
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const sleigh = world?.querySelector('[data-sleigh]');
  function flyover({ sound = true } = {}) {
    if (!sleigh || reduced || document.visibilityState !== 'visible') return;
    const w = window.innerWidth;
    const top = window.innerHeight * (0.08 + Math.random() * 0.22);
    const scale = 0.45 + Math.random() * 0.35;
    sleigh.style.top = `${top}px`;
    sleigh.animate(
      [
        { transform: `translate3d(${w + 40}px, 0, 0) scale(${scale}) rotate(-3deg)`, opacity: 0 },
        { opacity: 1, offset: 0.08 },
        { transform: `translate3d(${w * 0.45}px, -${40 * scale}px, 0) scale(${scale}) rotate(-6deg)`, offset: 0.5 },
        { opacity: 1, offset: 0.92 },
        { transform: `translate3d(-${900 * scale + 60}px, -${110 * scale}px, 0) scale(${scale}) rotate(-2deg)`, opacity: 0 },
      ],
      { duration: 9000 + Math.random() * 3000, easing: 'linear' },
    );
    if (sound) sfx('whoosh');
  }
  let flyTimer = 0;
  const scheduleFly = () => {
    clearTimeout(flyTimer);
    flyTimer = setTimeout(() => {
      flyover({ sound: false });
      scheduleFly();
    }, 35000 + Math.random() * 25000);
  };
  scheduleFly();

  return { flyover, burst: (x, y) => { for (let i = 0; i < 40; i++) spark(x, y, 3.2, 0, true); } };
}
