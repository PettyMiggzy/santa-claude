// Signs Santa's replies so /api/speak only voices text Santa actually wrote.
// The HMAC key is derived from VENICE_API_KEY, so there is no extra secret to set.
const enc = new TextEncoder();
const keys = new Map();

async function hmacKey(secret) {
  if (!keys.has(secret)) {
    const raw = await crypto.subtle.digest('SHA-256', enc.encode(`santa-speak:${secret}`));
    keys.set(secret, crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']));
  }
  return keys.get(secret);
}

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function signText(text, secret) {
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(text));
  return b64url(sig).slice(0, 32);
}

export async function verifyText(text, sig, secret) {
  if (typeof sig !== 'string' || sig.length !== 32) return false;
  const want = await signText(text, secret);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= want.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

// Small per-instance sliding-window limiter.
export function limiter({ windowMs, max }) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
    const limited = list.length >= max;
    if (!limited) list.push(now);
    hits.set(ip, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
    return limited;
  };
}

export function clientIp(request) {
  return (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || request.headers.get('x-real-ip') || 'local';
}
