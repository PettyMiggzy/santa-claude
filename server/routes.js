import { SITE } from '../src/config.js';
import { json, newNonce, checkSignIn, sessionCookie, clearCookie, profile, burned } from './perks.js';

export async function handleAuth(request, env = {}) {
  if (request.method === 'GET') return json(200, await newNonce(env));
  if (request.method === 'DELETE') return json(200, { ok: true }, { 'set-cookie': clearCookie });
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });
  let body;
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Bad JSON' });
  }
  if (!(await checkSignIn(env, body))) return json(401, { error: "That signature didn't check out. Try again." });
  return json(200, { ok: true, address: body.address }, { 'set-cookie': await sessionCookie(env, body.address, request) });
}

export async function handleMe(request, env = {}) {
  if (request.method !== 'GET') return json(405, { error: 'GET only' });
  const [me, burn] = await Promise.all([profile(env, request), burned(env)]);
  return json(200, { ...me, burn, perks: SITE.perks });
}
