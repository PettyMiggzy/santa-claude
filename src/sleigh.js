// The flying sleigh, animated for real: four reindeer galloping (4-frame leg
// cycle, each on its own beat with a body bob), the sleigh rocking, the gift sack
// bouncing, glowing double reins redrawn every frame through each harness, and a
// stardust trail. Drawn additively on a canvas, so the black art backgrounds vanish.
//
// Layout is in "base units" matching the original artwork (≈700 wide).
const DEER_SRC = '/img/deer-strip.png'; // 4 frames, each 264 x 246
const SLEIGH_SRC = '/img/sleigh-only.png'; // 207 x 183, sits at (505, 12)
const FW = 264;
const FH = 246;
const ANCHOR = { x: 120, y: 96 }; // antlers, in frame px
const CHEST = { x: 92, y: 124 }; // harness collar, in frame px
const K = 0.59; // frame px -> base units
const DEER = [
  { x: 85, y: 35, phase: 0 },
  { x: 195, y: 45, phase: 1.3 },
  { x: 315, y: 52, phase: 2.5 },
  { x: 425, y: 58, phase: 3.6 },
];
const SLEIGH = { x: 505, y: 12, w: 207, h: 183 };
const HANDS = { x: 575, y: 88 }; // where the reins start
const SACK = { x: 140, y: 22, w: 62, h: 66 }; // inside the sleigh image
const TAIL = { x: 700, y: 150 }; // stardust origin
const BASE_W = 700;

const loadImg = (src) =>
  new Promise((res, rej) => {
    const i = new Image();
    i.decoding = 'async';
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = src;
  });
let assets = null;
const getAssets = () => (assets ||= Promise.all([loadImg(DEER_SRC), loadImg(SLEIGH_SRC)]));

export function createSleigh(canvas, { width = () => 640, reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  let deerImg = null;
  let sleighImg = null;
  let raf = 0;
  let running = false;
  let dpr = 1;
  let W = 0;
  let H = 0;
  const dust = [];
  let flight = null; // { start, dur, top, loop, resolve }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  }
  const ro = new ResizeObserver(size);
  ro.observe(canvas);
  size();

  // position of the whole team on screen at progress p (0..1)
  function groupPose(p, t, s) {
    const gw = BASE_W * s;
    const x = W + 40 - p * (W + gw + 80);
    const y = flight.top + Math.sin(p * Math.PI) * -36 + Math.sin(t * 1.3) * 8;
    return { x, y, tilt: -0.06 + Math.sin(t * 0.9) * 0.015 };
  }

  function drawDeer(i, t, s) {
    const d = DEER[i];
    const beat = t * 9 + d.phase;
    const frame = Math.floor(beat) % 4;
    const bob = Math.sin((beat / 4) * Math.PI * 2) * 4;
    const pitch = Math.sin((beat / 4) * Math.PI * 2 + 0.8) * 0.06;
    const ax = d.x;
    const ay = d.y + bob;
    ctx.save();
    ctx.translate(ax * s, ay * s);
    ctx.rotate(pitch);
    ctx.drawImage(deerImg, frame * FW, 0, FW, FH, -ANCHOR.x * K * s, -ANCHOR.y * K * s, FW * K * s, FH * K * s);
    ctx.restore();
    // chest point (for the reins), rotated with the body
    const cx = (CHEST.x - ANCHOR.x) * K;
    const cy = (CHEST.y - ANCHOR.y) * K;
    return {
      x: ax + cx * Math.cos(pitch) - cy * Math.sin(pitch),
      y: ay + cx * Math.sin(pitch) + cy * Math.cos(pitch),
    };
  }

  function drawSleigh(t, s) {
    const bob = Math.sin(t * 2.6) * 4;
    const rot = Math.sin(t * 2.1) * 0.035;
    const pivot = { x: SLEIGH.x + SLEIGH.w / 2, y: SLEIGH.y + SLEIGH.h * 0.7 };
    ctx.save();
    ctx.translate(pivot.x * s, (pivot.y + bob) * s);
    ctx.rotate(rot);
    ctx.translate(-pivot.x * s, -pivot.y * s);
    // everything except the sack
    ctx.save();
    ctx.beginPath();
    ctx.rect(SLEIGH.x * s, SLEIGH.y * s, SLEIGH.w * s, SLEIGH.h * s);
    ctx.rect((SLEIGH.x + SACK.x) * s, (SLEIGH.y + SACK.y) * s, SACK.w * s, SACK.h * s);
    ctx.clip('evenodd');
    ctx.drawImage(sleighImg, SLEIGH.x * s, SLEIGH.y * s, SLEIGH.w * s, SLEIGH.h * s);
    ctx.restore();
    // the sack, bouncing on its own
    const sb = Math.abs(Math.sin(t * 5.2)) * -4;
    const sr = Math.sin(t * 5.2) * 0.05;
    ctx.save();
    ctx.translate((SLEIGH.x + SACK.x + SACK.w / 2) * s, (SLEIGH.y + SACK.y + SACK.h) * s);
    ctx.rotate(sr);
    ctx.translate(0, sb * s);
    ctx.drawImage(sleighImg, SACK.x, SACK.y, SACK.w, SACK.h, (-SACK.w / 2) * s, -SACK.h * s, SACK.w * s, SACK.h * s);
    ctx.restore();
    ctx.restore();
    // reins start at Santa's hands, moved with the sleigh
    const hx = HANDS.x - pivot.x;
    const hy = HANDS.y - pivot.y;
    return { x: pivot.x + hx * Math.cos(rot) - hy * Math.sin(rot), y: pivot.y + bob + hx * Math.sin(rot) + hy * Math.cos(rot) };
  }

  function drawReins(points, s, t) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const [off, alpha] of [[0, 1], [5, 0.7]]) {
      ctx.beginPath();
      ctx.moveTo(points[0].x * s, (points[0].y + off) * s);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const sag = 6 + Math.sin(t * 3 + i) * 2;
        ctx.quadraticCurveTo(((a.x + b.x) / 2) * s, ((a.y + b.y) / 2 + sag + off) * s, b.x * s, (b.y + off) * s);
      }
      ctx.strokeStyle = `rgba(47,245,212,${0.35 * alpha})`;
      ctx.lineWidth = 6 * s;
      ctx.stroke();
      ctx.strokeStyle = `rgba(200,255,246,${0.9 * alpha})`;
      ctx.lineWidth = 1.6 * s;
      ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!flight || !deerImg) return;
    const t = now / 1000;
    let p = (now - flight.start) / flight.dur;
    if (p >= 1) {
      if (flight.loop) {
        flight.start = now + 1200;
        p = 0;
      } else {
        const done = flight.resolve;
        flight = null;
        dust.length = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        stop();
        done?.();
        return;
      }
    }
    const s = width() / BASE_W;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';

    const g = groupPose(Math.max(0, p), t, s);

    // stardust trail (screen space, so it streams behind as the team moves)
    if (p > 0 && p < 1) {
      const tx = g.x + TAIL.x * s * Math.cos(g.tilt);
      const ty = g.y + TAIL.x * s * Math.sin(g.tilt) + TAIL.y * s;
      for (let i = 0; i < (reduced ? 1 : 5); i++) {
        dust.push({
          x: tx + Math.random() * 8,
          y: ty + (Math.random() - 0.5) * 16 * s,
          vx: 30 + Math.random() * 70,
          vy: (Math.random() - 0.5) * 30 + 8,
          life: 0,
          max: 0.9 + Math.random() * 1.4,
          r: 0.6 + Math.random() * 1.8,
          star: Math.random() < 0.25,
        });
      }
    }
    const dt = 1 / 60;
    for (let i = dust.length - 1; i >= 0; i--) {
      const d = dust[i];
      d.life += dt;
      if (d.life > d.max) {
        dust.splice(i, 1);
        continue;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vx *= 0.985;
      const k = 1 - d.life / d.max;
      const tw = 0.6 + 0.4 * Math.sin(t * 20 + i);
      ctx.fillStyle = `rgba(${d.star ? '230,255,252' : '47,245,212'},${k * tw})`;
      if (d.star) {
        const r = d.r * 2.2 * k + 0.5;
        ctx.fillRect(d.x - r, d.y - 0.6, r * 2, 1.2);
        ctx.fillRect(d.x - 0.6, d.y - r, 1.2, r * 2);
      } else {
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r * k + 0.3, 0, 6.283);
        ctx.fill();
      }
    }

    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.tilt);
    const hands = drawSleigh(t, s);
    const chests = [3, 2, 1, 0].map((i) => drawDeer(i, t, s));
    drawReins([hands, ...chests], s, t);
    ctx.restore();
  }

  function start() {
    if (running) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  async function ready() {
    if (!deerImg) [deerImg, sleighImg] = await getAssets();
  }

  return {
    /** Fly across once. top = y in px. Resolves when gone. */
    async fly({ top = H * 0.2, dur = 10000 } = {}) {
      await ready();
      if (flight) return;
      return new Promise((resolve) => {
        flight = { start: performance.now(), dur, top, loop: false, resolve };
        start();
      });
    },
    /** Keep flying across on a loop (the splash). */
    async loop({ top = () => H * 0.12, dur = 11000 } = {}) {
      await ready();
      flight = { start: performance.now(), dur, get top() { return top(); }, loop: true };
      start();
    },
    stop() {
      flight = null;
      stop();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    destroy() {
      this.stop();
      ro.disconnect();
    },
  };
}
