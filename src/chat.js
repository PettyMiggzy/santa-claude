// Talk to Santa: streaming chat with a Nice-o-meter and on-device memory.
const STORE = 'santa-claude:v1';
const MAX_SAVED = 40;
const GREETING = "Ho ho ho! Santa Claude here, freshly rebooted and ready. Tell me your name, your wish, or a good deed you did this week. I'm keeping score.";

const TAG_RE = /\[\[\s*nice\s*:\s*([+-]?\d+)\s*\]\]/i;

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

// Hide the score tag, including a half-streamed one at the end.
function clean(text) {
  return text
    .replace(/\[\[\s*nice[^\]]*\]\]/gi, '')
    .replace(/\s*\[\[?[^\]\n]{0,12}$/, '')
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

  const state = load();
  let busy = false;

  function renderMeter() {
    const n = Math.round(state.nice);
    niceNum.textContent = n;
    niceLbl.textContent = niceLabel(n);
    niceBar.style.width = `${Math.max(3, n)}%`;
    nameEl.textContent = state.name || 'friend';
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
    for (const m of state.messages) bubble(m.role, m.content);
    renderMeter();
  }

  function setBusy(b) {
    busy = b;
    sendBtn.disabled = b;
    sendBtn.textContent = b ? '…' : 'Send';
  }

  async function send(text) {
    text = text.trim().slice(0, 600);
    if (!text || busy) return;
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
        body: JSON.stringify({ messages: state.messages.slice(-12), name: state.name, nice: state.nice }),
      });
      if (!res.ok || !res.body) {
        let msg = 'Santa got tangled in the lights. Try again in a moment.';
        try {
          msg = (await res.json()).error || msg;
        } catch {
          /* not JSON */
        }
        throw new Error(msg);
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
      const reply = clean(raw).trim() || 'Ho ho… my circuits went quiet. Say that again?';
      p.textContent = reply;

      const m = raw.match(TAG_RE);
      const delta = m ? Math.max(-3, Math.min(3, parseInt(m[1], 10))) : 0;
      if (delta) {
        state.nice = Math.max(0, Math.min(100, state.nice + delta * 3));
        const pill = document.createElement('span');
        pill.className = `delta ${delta > 0 ? 'up' : 'down'}`;
        pill.textContent = `${delta > 0 ? '+' : ''}${delta * 3} nice`;
        el.appendChild(pill);
      }
      state.messages.push({ role: 'assistant', content: reply });
      save(state);
      renderMeter();
      talk(false);
      if (wantsDance) act(Math.random() < 0.5 ? 'dance' : 'ymca');
      else if (delta >= 2) act('cheer');
    } catch (err) {
      talk(false);
      el.classList.add('err');
      p.textContent = err.message || 'Santa could not reach the workshop.';
      // drop the unanswered message so a retry doesn't double it up
      state.messages.pop();
      save(state);
    } finally {
      log.scrollTop = log.scrollHeight;
      setBusy(false);
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
    state.name = '';
    state.nice = 50;
    state.messages = [];
    save(state);
    renderAll();
  });

  renderAll();
}
