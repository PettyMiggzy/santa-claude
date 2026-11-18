// The splash: night sky over the workshop, the sleigh crossing the moon, a boot
// log tied to the real 3D download, and the Enter button that unlocks sound.
import { unlock, setPrefs, start, sfx, speak } from './sound.js';

const LINES = [
  ['booting santa.exe', ''],
  ['loading naughty_list.sol', 'ok'],
  ['waking 9 reindeer', 'ok'],
  ['tuning ho_ho_ho.wav', 'ok'],
  ['rendering 3D santa', 'model'],
];

export function initSplash({ reduced = false, fx } = {}) {
  const el = document.getElementById('splash');
  const root = document.documentElement;
  if (!el) return;
  root.classList.add('splashing');

  const log = el.querySelector('[data-boot]');
  const bar = el.querySelector('[data-boot-bar]');
  const status = el.querySelector('[data-boot-status]');
  const enterBtn = el.querySelector('[data-enter]');
  const silentBtn = el.querySelector('[data-enter-silent]');

  let modelP = 0;
  let modelReady = false;
  let typedLines = 0;
  let modelLine = null;
  let entered = false;

  const progress = () => {
    const p = (typedLines / LINES.length) * 0.45 + (modelReady ? 1 : modelP) * 0.55;
    bar.style.width = `${Math.round(Math.min(1, p) * 100)}%`;
    if (modelReady && typedLines >= LINES.length) {
      el.classList.add('awake');
      status.textContent = 'Santa is awake.';
    }
  };
  const setModelText = () => {
    if (!modelLine) return;
    modelLine.textContent = modelReady ? 'ok' : `${Math.round(modelP * 100)}%`;
    modelLine.classList.toggle('ok', modelReady);
  };
  window.addEventListener('santa:progress', (e) => {
    modelP = e.detail;
    setModelText();
    progress();
  });
  window.addEventListener('santa:ready', () => {
    modelReady = true;
    setModelText();
    progress();
  });
  window.addEventListener('santa:3d-failed', () => {
    modelReady = true;
    setModelText();
    progress();
  });

  // type the boot log
  (async () => {
    for (const [text, state] of LINES) {
      const row = document.createElement('div');
      row.className = 'boot-line';
      const cmd = document.createElement('span');
      row.append('> ', cmd);
      log.appendChild(row);
      // typed look via a CSS steps() reveal, so a busy main thread can't stall it
      cmd.textContent = text;
      if (!reduced) {
        cmd.className = 'typed';
        cmd.style.setProperty('--n', text.length);
        await new Promise((r) => setTimeout(r, 260));
      }
      if (state) {
        const dots = document.createElement('span');
        dots.className = 'dots';
        const st = document.createElement('span');
        st.className = 'st';
        row.append(dots, st);
        if (state === 'model') {
          modelLine = st;
          setModelText();
        } else {
          await new Promise((r) => setTimeout(r, reduced ? 0 : 160));
          st.textContent = 'ok';
          st.classList.add('ok');
        }
      }
      typedLines++;
      progress();
      await new Promise((r) => setTimeout(r, reduced ? 0 : 120));
    }
  })();

  function enter(withSound) {
    if (entered) return;
    entered = true;
    unlock();
    setPrefs({ music: withSound, voice: withSound });
    start();
    if (withSound) sfx('bells');
    const r = enterBtn.getBoundingClientRect();
    fx?.burst(r.left + r.width / 2, r.top + r.height / 2);
    el.classList.add('out');
    setTimeout(
      () => {
        el.remove();
        root.classList.remove('splashing');
        window.dispatchEvent(new Event('santa:entered'));
        document.getElementById('main')?.focus({ preventScroll: true });
      },
      reduced ? 150 : 900,
    );
    if (withSound) setTimeout(() => speak({ line: 'welcome' }), 900);
    setTimeout(() => fx?.flyover({ sound: withSound }), 1600);
  }

  enterBtn.addEventListener('click', () => enter(true));
  silentBtn.addEventListener('click', () => enter(false));
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') enter(false);
  });
  enterBtn.focus({ preventScroll: true });
}
