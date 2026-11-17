// Santa drawn in text characters, sampled from the artwork at runtime, with a
// little "data rain" and glyph flicker. Static when reduced motion is on.
const SRC = '/img/santa-ascii-src.webp';
const RAMP = ' .:-=+*%#@';
const GLITCH = '01{}[]<>/\\|=+*#$';
const FONT = '"JetBrains Mono", ui-monospace, Menlo, monospace';
const BG = '#02040a';

export async function initAscii(canvas, countEl, { reduced = false } = {}) {
  const img = new Image();
  img.decoding = 'async';
  img.src = SRC;
  try {
    await img.decode();
  } catch {
    return;
  }
  try {
    await document.fonts.load(`12px ${FONT}`);
  } catch {
    /* fall back to whatever mono font is there */
  }

  const ctx = canvas.getContext('2d');
  let cols, rows, cw, ch, cells, dpr;

  function layout() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (!w || !h) return false;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    cols = w < 420 ? 72 : 120;
    cw = w / cols;
    ch = cw * 1.65;
    rows = Math.floor(h / ch);

    // sample the image at grid resolution
    const off = document.createElement('canvas');
    off.width = cols;
    off.height = rows;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    o.drawImage(img, 0, 0, cols, rows);
    const data = o.getImageData(0, 0, cols, rows).data;

    // contrast-stretch luminance (2nd..98th percentile) so the face reads
    const n = cols * rows;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // mix of luminance and max channel, so saturated red still counts as bright
      lum[i] = (0.45 * (0.2126 * r + 0.7152 * g + 0.0722 * b) + 0.55 * Math.max(r, g, b)) / 255;
    }
    const sorted = Float32Array.from(lum).sort();
    const lo = sorted[(n * 0.02) | 0];
    const hi = sorted[(n * 0.98) | 0] || 1;

    cells = new Array(n);
    let count = 0;
    for (let i = 0; i < n; i++) {
      const L = Math.min(1, Math.max(0, (lum[i] - lo) / (hi - lo || 1)));
      const Lg = Math.pow(L, 1.15);
      const chr = Lg < 0.06 ? ' ' : RAMP[Math.min(RAMP.length - 1, 1 + Math.floor(Lg * (RAMP.length - 1)))];
      if (chr !== ' ') count++;
      // brightness follows luminance: dark areas recede, highlights glow
      const k = 0.35 + Lg * 1.25;
      const r = Math.min(255, data[i * 4] * k + Lg * 40) | 0;
      const g = Math.min(255, data[i * 4 + 1] * k + Lg * 40) | 0;
      const b = Math.min(255, data[i * 4 + 2] * k + Lg * 48) | 0;
      cells[i] = { chr, col: `rgb(${r},${g},${b})`, until: 0 };
    }
    countEl && (countEl.textContent = count.toLocaleString('en-US'));
    return true;
  }

  function drawCell(i, chr, color) {
    const x = (i % cols) * cw;
    const y = Math.floor(i / cols) * ch;
    ctx.fillStyle = BG;
    ctx.fillRect(x, y, cw + 0.5, ch + 0.5);
    if (chr !== ' ') {
      ctx.fillStyle = color;
      ctx.fillText(chr, x + cw / 2, y + ch / 2);
    }
  }

  function drawAll() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${(cw * 1.45).toFixed(2)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < cells.length; i++) drawCell(i, cells[i].chr, cells[i].col);
  }

  if (!layout()) return;
  drawAll();

  new ResizeObserver(() => {
    if (layout()) drawAll();
  }).observe(canvas);

  if (reduced) return;

  // animation: flicker + falling data columns
  const drops = Array.from({ length: 9 }, () => ({ c: (Math.random() * cols) | 0, r: Math.random() * rows, v: 8 + Math.random() * 14 }));
  const dirty = new Set();
  let last = performance.now();
  let acc = 0;
  let running = false;
  let raf = 0;

  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min((now - last) / 1000, 0.1);
    last = now;
    acc += dt;
    if (acc < 1 / 30) return;
    acc = 0;

    // restore expired cells
    for (const i of dirty) {
      if (now >= cells[i].until) {
        drawCell(i, cells[i].chr, cells[i].col);
        dirty.delete(i);
      }
    }
    // random flicker on the drawing
    const flick = Math.max(2, (cols * rows * 0.0015) | 0);
    for (let n = 0; n < flick; n++) {
      const i = (Math.random() * cells.length) | 0;
      if (cells[i].chr === ' ') continue;
      drawCell(i, GLITCH[(Math.random() * GLITCH.length) | 0], cells[i].col);
      cells[i].until = now + 120 + Math.random() * 280;
      dirty.add(i);
    }
    // rain heads
    for (const d of drops) {
      d.r += d.v * dt * 3;
      if (d.r >= rows) {
        d.r = -Math.random() * rows * 0.5;
        d.c = (Math.random() * cols) | 0;
        d.v = 8 + Math.random() * 14;
      }
      const r = d.r | 0;
      if (r < 0) continue;
      const i = r * cols + d.c;
      drawCell(i, Math.random() < 0.5 ? '0' : '1', '#d9fff7');
      cells[i].until = now + 90;
      dirty.add(i);
      if (r > 0) {
        const j = i - cols;
        drawCell(j, GLITCH[(Math.random() * 3) | 0], '#2ff5d4');
        cells[j].until = now + 260;
        dirty.add(j);
      }
    }
  }

  new IntersectionObserver(([e]) => {
    if (e.isIntersecting && !running) {
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!e.isIntersecting && running) {
      running = false;
      cancelAnimationFrame(raf);
    }
  }).observe(canvas);
}
