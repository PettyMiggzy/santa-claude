// Sessions (sign in with a Solana wallet), holder tiers and daily cookies 🍪.
import { SITE } from '../src/config.js';
import { store } from './store.js';
import { isAddress, verifySignature, tokenBalance, tokenSupply } from './solana.js';
import { clientIp } from './sign.js';

const enc = new TextEncoder();
const P = SITE.perks;
const DAY = 86400;

function secret(env) {
  return env.SESSION_SECRET || `sess:${env.VENICE_API_KEY || 'dev-only-secret'}`;
}

async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return Buffer.from(sig).toString('base64url').slice(0, 32);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const resetAt = () => `${today()}T23:59:59Z`;

export function json(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

// ── sign-in ──────────────────────────────────────────────
export function signInMessage(address, nonce, issued) {
  return `${SITE.name} wants you to sign in with your Solana wallet:\n${address}\n\nThis only proves you own this wallet. It is free and moves no funds.\n\nNonce: ${nonce}\nIssued At: ${issued}`;
}

export async function newNonce(env) {
  const issued = new Date().toISOString();
  const rand = Buffer.from(crypto.getRandomValues(new Uint8Array(12))).toString('base64url');
  const nonce = `${rand}.${await hmac(env, `nonce:${rand}:${issued}`)}`;
  return { nonce, issued };
}

export async function checkSignIn(env, { address, nonce, issued, signature }) {
  if (!isAddress(address) || typeof nonce !== 'string' || typeof issued !== 'string' || typeof signature !== 'string') return false;
  const [rand, mac] = nonce.split('.');
  if (!rand || mac !== (await hmac(env, `nonce:${rand}:${issued}`))) return false;
  const age = Date.now() - Date.parse(issued);
  if (!(age >= -60000 && age < 10 * 60000)) return false;
  const sig = Buffer.from(signature, 'base64');
  return verifySignature(address, signInMessage(address, nonce, issued), sig);
}

export async function sessionCookie(env, address, request) {
  const exp = Math.floor(Date.now() / 1000) + 7 * DAY;
  const value = `${address}.${exp}.${await hmac(env, `sess:${address}:${exp}`)}`;
  const secure = (request.headers.get('x-forwarded-proto') || new URL(request.url).protocol.replace(':', '')) === 'https';
  return `sc_sess=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * DAY}${secure ? '; Secure' : ''}`;
}

export const clearCookie = 'sc_sess=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export async function sessionAddress(env, request) {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)sc_sess=([^;]+)/);
  if (!m) return null;
  const [address, exp, mac] = m[1].split('.');
  if (!address || !exp || Number(exp) < Date.now() / 1000) return null;
  if (mac !== (await hmac(env, `sess:${address}:${exp}`))) return null;
  return isAddress(address) ? address : null;
}

// ── tiers + cookies ──────────────────────────────────────
export function tierFor(holding) {
  let t = null;
  for (const tier of P.tiers) if (holding >= tier.min) t = tier;
  return t;
}

async function holdingOf(env, kv, address) {
  if (!SITE.contractAddress) return 0;
  const key = `hold:${address}`;
  const cached = await kv.get(key);
  if (cached != null) return cached;
  let h = 0;
  try {
    h = await tokenBalance(env, address, SITE.contractAddress);
  } catch (e) {
    console.error('balance check failed', e.message);
  }
  await kv.set(key, h, 600);
  return h;
}

/** Everything the page needs to show the visitor's status. */
export async function profile(env, request) {
  const kv = store(env);
  const address = await sessionAddress(env, request);
  if (!address) {
    const used = Number(await kv.get(`ip:${today()}:${clientIp(request)}`)) || 0;
    return { signedIn: false, allowance: P.freeMessagesPerDay, used, left: Math.max(0, P.freeMessagesPerDay - used), resetAt: resetAt(), unit: 'messages' };
  }
  const holding = await holdingOf(env, kv, address);
  const tier = tierFor(holding);
  const allowance = tier ? tier.cookies : P.walletCookiesPerDay;
  const used = Number(await kv.get(`use:${today()}:${address}`)) || 0;
  return { signedIn: true, address, holding, tier: tier?.name || null, allowance, used, left: Math.max(0, allowance - used), resetAt: resetAt(), unit: 'cookies' };
}

/** Charge the visitor. Returns { ok, left } or { ok:false, reason }. */
export async function spend(env, request, cost) {
  const kv = store(env);
  const p = await profile(env, request);
  if (!p.signedIn && cost > 1) return { ok: false, reason: 'signin', profile: p };
  const key = p.signedIn ? `use:${today()}:${p.address}` : `ip:${today()}:${clientIp(request)}`;
  const used = await kv.incr(key, cost, 2 * DAY);
  if (used > p.allowance) {
    await kv.incr(key, -cost, 2 * DAY);
    return { ok: false, reason: p.signedIn ? 'cookies' : 'free', profile: p };
  }
  return { ok: true, left: p.allowance - used, refund: () => kv.incr(key, -cost, 2 * DAY) };
}

export async function burned(env) {
  if (!SITE.contractAddress || !P.initialSupply) return null;
  const kv = store(env);
  const cached = await kv.get('burned');
  if (cached != null) return cached;
  try {
    const supply = await tokenSupply(env, SITE.contractAddress);
    const b = { burned: Math.max(0, P.initialSupply - supply), supply };
    await kv.set('burned', b, 300);
    return b;
  } catch {
    return null;
  }
}
