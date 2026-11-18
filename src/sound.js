// Sound: a music-box medley of public-domain carols, sleigh bells, little UI
// sounds, and Santa's voice (Venice TTS via /api/speak, browser voice as backup).
// Everything is synthesized with Web Audio: no audio files, nothing to license.
//
// Browsers only allow sound after a click, so call unlock() from a click handler
// (the splash's Enter button does this).
const PREF = 'santa-claude:sound:v1';
const WELCOME = "Ho ho ho! Welcome to the workshop. I'm Santa Claude, freshly rebooted and keeping score. Come say hi!";

let ctx = null;
let master, musicBus, sfxBus, voiceBus, reverb, analyser, noiseBuf;
let prefs = loadPrefs();
let musicOn = false;
let schedTimer = 0;
let speakId = 0;
let currentVoice = null; // { stop() }
const listeners = new Set();

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREF) || 'null');
    if (p && typeof p.music === 'boolean' && typeof p.voice === 'boolean') return p;
  } catch {
    /* storage blocked */
  }
  return { music: true, voice: true };
}
function savePrefs() {
  try {
    localStorage.setItem(PREF, JSON.stringify(prefs));
  } catch {
    /* fine */
  }
  listeners.forEach((fn) => fn({ ...prefs }));
}
export const getPrefs = () => ({ ...prefs });
export const onPrefs = (fn) => (listeners.add(fn), () => listeners.delete(fn));

// ── notes ───────────────────────────────────────────────
function hz(n) {
  const m = /^([A-G])(#|b)?(\d)$/.exec(n);
  const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  return 440 * Math.pow(2, ((Number(m[3]) + 1) * 12 + pc - 69) / 12);
}

// [note | null, beats]. Both carols are public domain (1857, 16th century).
const A1 = [['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['E5', 1], ['E5', 2], ['E5', 1], ['G5', 1], ['C5', 1.5], ['D5', 0.5], ['E5', 4]];
const A2 = [['F5', 1], ['F5', 1], ['F5', 1.5], ['F5', 0.5], ['F5', 1], ['E5', 1], ['E5', 1], ['E5', 0.5], ['E5', 0.5]];
const SONGS = [
  {
    bpm: 132,
    beatsPerBar: 4,
    bells: true,
    melody: [...A1, ...A2, ['E5', 1], ['D5', 1], ['D5', 1], ['E5', 1], ['D5', 2], ['G5', 2], ...A1, ...A2, ['G5', 1], ['G5', 1], ['F5', 1], ['D5', 1], ['C5', 4]],
    bass: ['C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'D3', 'G3', 'C3', 'C3', 'C3', 'C3', 'F3', 'C3', 'G3', 'C3'],
    pickup: 0,
  },
  {
    bpm: 150,
    beatsPerBar: 3,
    bells: false,
    melody: [
      ['D5', 1],
      ['G5', 1], ['G5', 0.5], ['A5', 0.5], ['G5', 0.5], ['F#5', 0.5],
      ['E5', 1], ['E5', 1], ['E5', 1],
      ['A5', 1], ['A5', 0.5], ['B5', 0.5], ['A5', 0.5], ['G5', 0.5],
      ['F#5', 1], ['D5', 1], ['D5', 1],
      ['B5', 1], ['B5', 0.5], ['C6', 0.5], ['B5', 0.5], ['A5', 0.5],
      ['G5', 1], ['E5', 1], ['D5', 0.5], ['D5', 0.5],
      ['E5', 1], ['A5', 1], ['F#5', 1],
      ['G5', 3],
    ],
    bass: ['G3', 'C3', 'A3', 'D3', 'B3', 'C3', 'D3', 'G3'],
    pickup: 1,
  },
];

// ── setup ───────────────────────────────────────────────
function build() {
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);

  // small generated room reverb
  reverb = ctx.createConvolver();
  const len = Math.floor(ctx.sampleRate * 2.2);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  }
  reverb.buffer = ir;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  reverb.connect(wet).connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  musicBus.connect(reverb);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = prefs.music ? 0.55 : 0;
  sfxBus.connect(master);
  sfxBus.connect(reverb);

  analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  voiceBus.connect(analyser);
  analyser.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
}

/** Call from a click/tap handler. Safe to call many times. */
export function unlock() {
  try {
    if (!ctx) build();
    if (ctx.state === 'suspended') ctx.resume();
  } catch {
    /* no Web Audio */
  }
}

// ── instruments ─────────────────────────────────────────
function env(g, t, peak, decay) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
}

function musicBox(t, f, vel = 0.16, bus = musicBus) {
  const partials = [
    [1, vel, 1.5],
    [2, vel * 0.32, 0.7],
    [3.01, vel * 0.12, 0.35],
    [5.4, vel * 0.05, 0.12],
  ];
  for (const [mul, v, d] of partials) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = f * mul;
    const g = ctx.createGain();
    env(g, t, v, d);
    o.connect(g).connect(bus);
    o.start(t);
    o.stop(t + d + 0.05);
  }
}

function bass(t, f, dur) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const g = ctx.createGain();
  env(g, t, 0.12, Math.min(dur, 1.2));
  o.connect(lp).connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function bellHit(t, vol, bus) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 7000 + Math.random() * 2500;
  bp.Q.value = 1.2;
  const g = ctx.createGain();
  env(g, t, vol * 0.5, 0.09);
  n.connect(bp).connect(g).connect(bus);
  n.start(t, Math.random() * 0.5);
  n.stop(t + 0.12);
  for (let k = 0; k < 2; k++) {
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 2600 + Math.random() * 3800;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2200;
    const og = ctx.createGain();
    env(og, t, vol * 0.05, 0.1 + Math.random() * 0.08);
    o.connect(hp).connect(og).connect(bus);
    o.start(t);
    o.stop(t + 0.22);
  }
}

function sleighBells(t, vol = 0.5, bus = sfxBus, hits = 6) {
  for (let i = 0; i < hits; i++) bellHit(t + Math.random() * 0.07 + (i % 2) * 0.03, vol * (0.6 + Math.random() * 0.4), bus);
}

// ── music scheduler ─────────────────────────────────────
function songEvents() {
  const ev = [];
  let offset = 0;
  for (const s of SONGS) {
    const spb = 60 / s.bpm;
    let beat = 0;
    for (const [n, b] of s.melody) {
      if (n) ev.push({ t: offset + beat * spb, kind: 'note', f: hz(n) });
      beat += b;
    }
    s.bass.forEach((n, i) => {
      const bt = s.pickup + i * s.beatsPerBar;
      ev.push({ t: offset + bt * spb, kind: 'bass', f: hz(n), d: s.beatsPerBar * spb * 0.9 });
      if (s.beatsPerBar === 4) ev.push({ t: offset + (bt + 2) * spb, kind: 'bass', f: hz(n) * 1.5, d: 2 * spb * 0.9 });
      if (s.bells) [1, 3].forEach((k) => ev.push({ t: offset + (bt + k) * spb, kind: 'bells' }));
    });
    offset += beat * spb + 2 * spb; // short breath between carols
  }
  ev.sort((a, b) => a.t - b.t);
  return { ev, length: offset };
}
const TRACK = songEvents();
let loopStart = 0;
let cursor = 0;

function schedule() {
  const ahead = ctx.currentTime + 0.15;
  for (;;) {
    if (cursor >= TRACK.ev.length) {
      cursor = 0;
      loopStart += TRACK.length + 1.5;
    }
    const e = TRACK.ev[cursor];
    const t = loopStart + e.t;
    if (t > ahead) break;
    if (t >= ctx.currentTime - 0.05) {
      if (e.kind === 'note') musicBox(t, e.f);
      else if (e.kind === 'bass') bass(t, e.f, e.d);
      else sleighBells(t, 0.16, musicBus, 3);
    }
    cursor++;
  }
}

function startMusic() {
  if (!ctx || musicOn) return;
  musicOn = true;
  loopStart = ctx.currentTime + 0.3;
  cursor = 0;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0.42, ctx.currentTime, 0.6);
  schedule();
  schedTimer = setInterval(schedule, 40);
}
function stopMusic() {
  if (!ctx || !musicOn) return;
  musicOn = false;
  clearInterval(schedTimer);
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.25);
}

function duck(on) {
  if (!ctx || !musicOn) return;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(on ? 0.1 : 0.42, ctx.currentTime, 0.2);
}

// ── public controls ─────────────────────────────────────
export function setPrefs(next) {
  prefs = { ...prefs, ...next };
  savePrefs();
  if (!ctx) return;
  sfxBus.gain.setTargetAtTime(prefs.music ? 0.55 : 0, ctx.currentTime, 0.05);
  if (prefs.music) startMusic();
  else stopMusic();
  if (!prefs.voice) stopVoice();
}

/** Start whatever the saved prefs say (after unlock). */
export function start() {
  if (!ctx) return;
  sfxBus.gain.value = prefs.music ? 0.55 : 0;
  if (prefs.music) startMusic();
}

export function sfx(kind) {
  if (!ctx || !prefs.music || ctx.state !== 'running') return;
  const t = ctx.currentTime + 0.01;
  if (kind === 'click') {
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(1500, t);
    o.frequency.exponentialRampToValueAtTime(700, t + 0.05);
    const g = ctx.createGain();
    env(g, t, 0.05, 0.06);
    o.connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.08);
  } else if (kind === 'bells') {
    sleighBells(t, 0.45, sfxBus, 8);
  } else if (kind === 'nice') {
    ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => musicBox(t + i * 0.08, hz(n), 0.12, sfxBus));
  } else if (kind === 'naughty') {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const g = ctx.createGain();
    env(g, t, 0.12, 0.35);
    o.connect(lp).connect(g).connect(sfxBus);
    o.start(t);
    o.stop(t + 0.4);
  } else if (kind === 'whoosh') {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuf;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(2600, t + 1.6);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    n.connect(bp).connect(g).connect(sfxBus);
    n.start(t);
    n.stop(t + 2.5);
    sleighBells(t + 0.6, 0.3, sfxBus, 10);
  } else if (kind === 'sparkle') {
    for (let i = 0; i < 5; i++) musicBox(t + i * 0.045, hz(['C7', 'G6', 'E7', 'C7', 'G7'][i]), 0.05, sfxBus);
  }
}

// ── Santa's voice ───────────────────────────────────────
const talk = (on) => window.dispatchEvent(new CustomEvent('santa:talk', { detail: on }));

function stopVoice() {
  speakId++;
  if (currentVoice) {
    currentVoice.stop();
    currentVoice = null;
  }
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* fine */
  }
}

function plainText(text) {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_#`>~|]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function browserVoice(text, id) {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth || !text) return resolve(false);
    const u = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices().filter((v) => /^en/i.test(v.lang));
    u.voice =
      voices.find((v) => /male|daniel|fred|alex|george|guy|david|google uk english male/i.test(v.name) && !/female/i.test(v.name)) ||
      voices[0] ||
      null;
    u.pitch = 0.55;
    u.rate = 0.92;
    u.volume = 1;
    u.onstart = () => {
      if (id === speakId) {
        talk(true);
        duck(true);
      }
    };
    const done = () => {
      if (id === speakId) {
        talk(false);
        duck(false);
      }
      resolve(true);
    };
    u.onend = done;
    u.onerror = done;
    synth.speak(u);
    currentVoice = { stop: () => synth.cancel() };
  });
}

/**
 * Speak a signed reply ({ text, sig }) or a fixed line ({ line: 'welcome' }).
 * Resolves when Santa has finished talking (or right away if voice is off).
 */
export async function speak({ text, sig, line }) {
  if (!prefs.voice) return false;
  unlock();
  stopVoice();
  const id = ++speakId;
  const spoken = plainText(line === 'welcome' ? WELCOME : text || '');
  if (!spoken) return false;
  try {
    const res = await fetch('/api/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(line ? { line } : { text, sig }),
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.arrayBuffer();
    if (id !== speakId) return false;
    const buf = await ctx.decodeAudioData(data);
    if (id !== speakId) return false;
    return await new Promise((resolve) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(voiceBus);
      src.onended = () => {
        if (id === speakId) {
          talk(false);
          duck(false);
          currentVoice = null;
        }
        resolve(true);
      };
      currentVoice = { stop: () => src.stop() };
      talk(true);
      duck(true);
      src.start();
    });
  } catch {
    if (id !== speakId) return false;
    return browserVoice(spoken, id);
  }
}

export function stopSpeaking() {
  stopVoice();
  talk(false);
  duck(false);
}

/** 0..1 loudness of Santa's voice right now (for visuals). */
export function voiceLevel() {
  if (!analyser) return 0;
  const a = new Uint8Array(analyser.fftSize);
  analyser.getByteTimeDomainData(a);
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += ((a[i] - 128) / 128) ** 2;
  return Math.min(1, Math.sqrt(sum / a.length) * 4);
}
