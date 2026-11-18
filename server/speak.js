// Santa's voice: POST /api/speak -> audio/mpeg, via Venice text-to-speech.
//
// body: { text, sig }   a reply from /api/chat with its [[sig:...]] (only Santa's own words)
//    or { line: 'welcome' }   one of the fixed lines below
//
// Env vars: VENICE_API_KEY (required), VENICE_TTS_MODEL (default tts-kokoro),
//           VENICE_TTS_VOICE (default am_santa), VENICE_BASE_URL.
import { verifyText, limiter, clientIp } from './sign.js';

export const LINES = {
  welcome: "Ho ho ho! Welcome to the workshop. I'm Santa Claude, freshly rebooted and keeping score. Come say hi!",
};

const limited = limiter({ windowMs: 10 * 60 * 1000, max: 40 });
const MAX_CHARS = 700;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// What Santa says out loud: no score tags, links, emoji or markdown symbols.
export function speakable(text) {
  return text
    .replace(/\[\[[^\]]*\]\]/g, '')
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/[*_#`>~|]/g, '')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_CHARS);
}

export async function handleSpeak(request, env = {}) {
  if (request.method !== 'POST') return json(405, { error: 'POST only' });
  const key = env.VENICE_API_KEY;
  if (!key) {
    console.error('speak: VENICE_API_KEY is not set');
    return json(503, { error: 'Voice is offline right now.' });
  }
  if (limited(clientIp(request))) return json(429, { error: 'Santa needs to rest his voice. Try again soon.' });

  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Bad JSON' });
  }

  let text;
  if (typeof body?.line === 'string' && LINES[body.line]) {
    text = LINES[body.line];
  } else if (typeof body?.text === 'string' && body.text.length <= 4000) {
    if (!(await verifyText(body.text, body.sig, key))) return json(403, { error: 'Santa only reads his own words.' });
    text = body.text;
  } else {
    return json(400, { error: 'Nothing to say.' });
  }

  const input = speakable(text);
  if (!input) return json(400, { error: 'Nothing to say.' });

  const base = env.VENICE_BASE_URL || 'https://api.venice.ai/api/v1';
  let upstream;
  try {
    upstream = await fetch(`${base}/audio/speech`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: env.VENICE_TTS_MODEL || 'tts-kokoro',
        voice: env.VENICE_TTS_VOICE || 'am_santa',
        input,
        response_format: 'mp3',
        speed: 0.95,
      }),
    });
  } catch {
    return json(502, { error: 'Voice could not reach the workshop.' });
  }
  if (!upstream.ok || !upstream.body) {
    const detail = await upstream.text().catch(() => '');
    console.error('venice tts error', upstream.status, detail.slice(0, 200));
    return json(upstream.status === 402 ? 402 : 502, { error: 'Voice unavailable right now.' });
  }
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': upstream.headers.get('content-type') || 'audio/mpeg',
      'cache-control': body?.line ? 'public, max-age=86400' : 'no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
