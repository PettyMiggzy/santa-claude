// Talk to Santa: streaming chat, Santa's voice, a Nice-o-meter and on-device memory.
import { speak, stopSpeaking, sfx, getPrefs, setPrefs, onPrefs, unlock, voiceLevel } from './sound.js';

const STORE = 'santa-claude:v1';
const MAX_SAVED = 40;
const GREETING = "Ho ho ho! Santa Claude here, freshly rebooted and ready. Tell me your name, your wish, or a good deed you did this week. I'm keeping score.";

const TAG_RE = /\[\[\s*nice\s*:\s*([+-]?\d+)\s*\]\]/i;
const SIG_RE = /\[\[sig:([A-Za-z0-9_-]{32})\]\]$/;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (s && Array.isArray(s.messages)) return { name: s.name || '', nice: Number.isFinite(s.nice) ? s.nice : 50, messages: s.messages };
  } catch {
    /* storage blocked or corrupt */
  }
  return { name: '', nice: 50, messages: [] };
}

function save(state) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...state, messages: state.messages.slice(-MAX_SAVED) }));
  } catch {
    /* private mode: memory lasts for this visit only */
  }
}

function niceLabel(n) {
  if (n >= 95) return "Santa's favourite";
  if (n >= 80) return 'Very nice';
  if (n >= 60) return 'Nice list';
  if (n >= 40) return 'On the fence';
  if (n >= 20) return 'Naughty list';
  return 'Coal incoming';
}

// Hide [[...]] tags, including a half-streamed one at the end.
function clean(text) {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/\s*\[\[?[^\]\n]{0,40}$/, '')
    .replace(/\s*\[\[[^\]\n]*\]?$/, '')
    .trimEnd();
}

const act = (kind) => window.dispatchEvent(new CustomEvent('santa:act', { detail: kind }));
const talk = (on) => window.dispatchEvent(new CustomEvent('santa:talk', { detail: on }));

export function initChat(root) {
  const log = root.querySelector('[data-log]');
  const form = root.querySelector('[data-form]');
  const input = form.querySelector('input');
  const sendBtn = root.querySelector('[data-send]');
  const nameBtn = root.querySelector('[data-name-btn]');
  const nameEl = root.querySelector('[data-name]');
  const niceNum = root.querySelector('[data-nice-num]');
  const niceLbl = root.querySelector('[data-nice-label]');
  const niceBar = root.querySelector('[data-nice-bar]');
  const voiceBtn = root.querySelector('[data-voice]');
  const voiceLbl = root.querySelector('[data-voice-label]');
  const speakingEl = root.querySelector('[data-speaking]');

  const state = load();
  let busy = false;

  // ── voice toggle + "Santa is speaking" bars ─────────────
  const renderVoice = (p) => {
    voiceBtn.setAttribute('aria-pressed', String(p.voice));
    voiceLbl.textContent = p.voice ? 'on' : 'off';
  };
  renderVoice(getPrefs());
  onPrefs(renderVoice);
  voiceBtn.addEventListener('click', () => {
    unlock();
    const on = !getPrefs().voice;
    setPrefs({ voice: on });
    if (!on) stopSpeaking();
  });
  root.querySelector('[data-hush]')?.addEventListener('click', () => stopSpeaking());

  const bars = [...speakingEl.querySelectorAll('i')];
  let barRaf = 0;
  window.addEventListener('santa:talk', (e) => {
    speakingEl.classList.toggle('on', !!e.detail && !busy);
    cancelAnimationFrame(barRaf);
    if (!e.detail) return;
    const loop = (t) => {
      const lvl = voiceLevel();
      bars.forEach((b, i) => {
        const v = lvl > 0.02 ? lvl : 0.25 + 0.25 * Math.sin(t / 120 + i * 1.3); // browser voice has no level
        b.style.transform = `scaleY(${(0.25 + v * (0.6 + 0.4 * Math.sin(t / 90 + i))).toFixed(2)})`;
      });
      barRaf = requestAnimationFrame(loop);
    };
    barRaf = requestAnimationFrame(loop);
  });

  // ── rendering ───────────────────────────────────────────
  function renderMeter() {
    const n = Math.round(state.nice);
    niceNum.textContent = n;
    niceLbl.textContent = niceLabel(n);
    niceBar.style.width = `${Math.max(3, n)}%`;
    nameEl.textContent = state.name || 'friend';
  }

  function addReplay(div, msg) {
    if (!msg.sig || !msg.raw) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'replay';
    b.setAttribute('aria-label', 'Hear Santa say this');
    b.textContent = '🔊';
    b.addEventListener('click', () => {
      unlock();
      if (!getPrefs().voice) setPrefs({ voice: true });
      speak({ text: msg.raw, sig: msg.sig });
    });
    div.appendChild(b);
  }

  function bubble(role, text, extra = '') {
    const div = document.createElement('div');
    div.className = `msg ${role === 'user' ? 'you' : 'santa'} ${extra}`.trim();
    const p = document.createElement('p');
    p.textContent = text;
    div.appendChild(p);
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function renderAll() {
    log.textContent = '';
    bubble('assistant', GREETING);
    for (const m of state.messages) {
      const div = bubble(m.role, m.content);
      if (m.role === 'assistant') addReplay(div, m);
    }
    renderMeter();
  }

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
    sendBtn.textContent = b ? '…' : 'Send';
  }

  // ── talking ─────────────────────────────────────────────
  async function send(text) {
    text = text.trim().slice(0, 600);
    if (!text || busy) return;
    unlock();
    stopSpeaking();
    setBusy(true);

    const named = text.match(/\b(?:my name is|call me|name's|i am called)\s+([\p{L}][\p{L}\p{N}'-]{0,20})/iu);
    if (named) state.name = named[1].charAt(0).toUpperCase() + named[1].slice(1);

    const first = state.messages.length === 0;
    state.messages.push({ role: 'user', content: text });
    bubble('user', text);
    save(state);
    renderMeter();

    const wantsDance = /\b(danc|ymca|boogie|groove|bust a move)/i.test(text);
    if (first || /^(hi|hello|hey|yo|gm|sup|howdy|ho ho)\b/i.test(text)) act('wave');

    const el = bubble('assistant', '');
    const p = el.querySelector('p');
    p.innerHTML = '<span class="typing" aria-label="Santa is typing"><span></span><span></span><span></span></span>';
    talk(true);

    let raw = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: state.messages.slice(-12).map(({ role, content }) => ({ role, content })),
          name: state.name,
          nice: state.nice,
        }),
      });
      if (!res.ok || !res.body) {
        let msg = 'Santa got tangled in the lights. Try again in a moment.';
        let code = '';
        try {
          const j = await res.json();
          msg = j.error || msg;
          code = j.code || '';
        } catch {
          /* not JSON */
        }
        throw Object.assign(new Error(msg), { code });
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        raw += dec.decode(value, { stream: true });
        const shown = clean(raw);
        if (shown) {
          p.textContent = shown;
          log.scrollTop = log.scrollHeight;
        }
      }
      raw += dec.decode();

      // split off the signature: it covers exactly the text before it
      const sm = raw.match(SIG_RE);
      const signed = sm ? raw.slice(0, raw.length - sm[0].length) : raw;
      const reply = clean(signed).trim() || 'Ho ho… my circuits went quiet. Say that again?';
      p.textContent = reply;

      const m = signed.match(TAG_RE);
      const delta = m ? Math.max(-3, Math.min(3, parseInt(m[1], 10))) : 0;
      if (delta) {
        state.nice = Math.max(0, Math.min(100, state.nice + delta * 3));
        const pill = document.createElement('span');
        pill.className = `delta ${delta > 0 ? 'up' : 'down'}`;
        pill.textContent = `${delta > 0 ? '+' : ''}${delta * 3} nice`;
        el.appendChild(pill);
        sfx(delta > 0 ? 'nice' : 'naughty');
      }
      window.dispatchEvent(new Event('santa:spent'));
      const msg = { role: 'assistant', content: reply, ...(sm ? { raw: signed, sig: sm[1] } : {}) };
      state.messages.push(msg);
      addReplay(el, msg);
      save(state);
      renderMeter();
      setBusy(false);

      if (wantsDance) act(Math.random() < 0.5 ? 'dance' : 'ymca');
      else if (delta >= 2) act('cheer');

      if (getPrefs().voice && sm) {
        await speak({ text: signed, sig: sm[1] }); // keeps Santa talking until he's done
      } else {
        talk(false);
      }
    } catch (err) {
      talk(false);
      el.classList.add('err');
      p.textContent = err.message || 'Santa could not reach the workshop.';
      if (err.code === 'free' || err.code === 'cookies') {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm btn-main';
        b.textContent = err.code === 'free' ? 'Sign in with wallet' : 'See holder perks';
        b.style.marginTop = '10px';
        b.addEventListener('click', () => (err.code === 'free' ? window.dispatchEvent(new Event('santa:signin')) : document.getElementById('perks')?.scrollIntoView({ behavior: 'smooth' })));
        el.appendChild(b);
      }
      // drop the unanswered message so a retry doesn't double it up
      state.messages.pop();
      save(state);
      setBusy(false);
    } finally {
      log.scrollTop = log.scrollHeight;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value;
    input.value = '';
    send(v);
  });

  root.querySelector('[data-quick]')?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) send(b.textContent);
  });

  nameBtn.addEventListener('click', () => {
    const field = document.createElement('input');
    field.className = 'who';
    field.maxLength = 32;
    field.value = state.name;
    field.placeholder = 'Your name';
    field.setAttribute('aria-label', 'Your name');
    nameBtn.replaceWith(field);
    field.focus();
    const done = () => {
      state.name = field.value.replace(/[^\p{L}\p{N} ._'-]/gu, '').trim().slice(0, 32);
      save(state);
      field.replaceWith(nameBtn);
      renderMeter();
    };
    field.addEventListener('blur', done, { once: true });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        field.blur();
      }
      if (e.key === 'Escape') {
        field.value = state.name;
        field.blur();
      }
    });
  });

  root.querySelector('[data-forget]')?.addEventListener('click', () => {
    stopSpeaking();
    state.name = '';
    state.nice = 50;
    state.messages = [];
    save(state);
    renderAll();
  });

  renderAll();
}
