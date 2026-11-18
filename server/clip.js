// Santa Clips: a short AI video of Santa in any scene, paid with cookies 🍪.
//   POST /api/clip { prompt }      -> { id, left }       (signed-in wallets with enough cookies)
//   GET  /api/clip?id=             -> { status, progress }
//   GET  /api/clip?id=&file=1      -> the mp4
// Env: VENICE_API_KEY, VENICE_VIDEO_MODEL (default below), VENICE_BASE_URL.
import { SITE } from '../src/config.js';
import { store } from './store.js';
import { json, spend, sessionAddress, today } from './perks.js';
import { CLIP_REF } from './clip-ref.js';

const MODEL = 'grok-imagine-1-5-lite-image-to-video';
const base = (env) => env.VENICE_BASE_URL || 'https://api.venice.ai/api/v1';
const auth = (env) => ({ authorization: `Bearer ${env.VENICE_API_KEY}`, 'content-type': 'application/json' });

function videoPrompt(user) {
  return `The cyborg Santa Claus from the image (chrome robotic face plates, glowing teal eyes, white beard, red Santa suit, headphones): ${user}. Keep his look exactly. Festive, cinematic, family friendly, smooth natural motion.`;
}

async function refund(env, kv, job, id) {
  if (job.refunded) return;
  job.refunded = true;
  await kv.incr(`use:${job.day}:${job.owner}`, -SITE.perks.cost.clip, 2 * 86400);
  await kv.set(`clip:${id}`, job, 86400);
}

export async function handleClip(request, env = {}) {
  if (!env.VENICE_API_KEY) return json(503, { error: 'Santa Clips are offline right now.' });
  const kv = store(env);
  const url = new URL(request.url);

  if (request.method === 'POST') {
    const owner = await sessionAddress(env, request);
    if (!owner) return json(401, { error: 'Sign in with your wallet to make Santa Clips.', code: 'signin' });
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, { error: 'Bad JSON' });
    }
    const prompt = typeof body?.prompt === 'string' ? body.prompt.replace(/\s+/g, ' ').trim().slice(0, 300) : '';
    if (prompt.length < 3) return json(400, { error: 'Tell Santa what to do in the clip.' });

    const paid = await spend(env, request, SITE.perks.cost.clip);
    if (!paid.ok) return json(402, { error: `A clip costs ${SITE.perks.cost.clip} 🍪. Hold more $SANTA for a bigger daily drop.`, code: paid.reason });

    let res;
    try {
      res = await fetch(`${base(env)}/video/queue`, {
        method: 'POST',
        headers: auth(env),
        body: JSON.stringify({
          model: env.VENICE_VIDEO_MODEL || MODEL,
          prompt: videoPrompt(prompt),
          duration: '6s',
          resolution: '720p',
          image_url: CLIP_REF,
        }),
      });
    } catch {
      await paid.refund();
      return json(502, { error: "Santa's camera crew couldn't be reached. Cookies refunded." });
    }
    const out = await res.json().catch(() => ({}));
    if (!res.ok || !out.queue_id) {
      await paid.refund();
      console.error('video queue error', res.status, JSON.stringify(out).slice(0, 200));
      return json(res.status === 422 ? 422 : 502, { error: res.status === 422 ? "Santa can't film that one. Cookies refunded." : 'Clip studio is busy. Cookies refunded.' });
    }
    const id = out.queue_id;
    await kv.set(`clip:${id}`, { owner, prompt, day: today(), created: Date.now(), dl: out.download_url || null }, 86400);
    return json(200, { id, left: paid.left });
  }

  if (request.method !== 'GET') return json(405, { error: 'Method not allowed' });
  const id = url.searchParams.get('id') || '';
  const job = id && (await kv.get(`clip:${id}`));
  if (!job) return json(404, { error: 'Clip not found or expired.' });

  if (url.searchParams.get('file')) {
    if (job.dl) return Response.redirect(job.dl, 302);
  }

  const r = await fetch(`${base(env)}/video/retrieve`, { method: 'POST', headers: auth(env), body: JSON.stringify({ queue_id: id }) });
  const type = r.headers.get('content-type') || '';
  if (r.ok && type.startsWith('video/')) {
    if (url.searchParams.get('file')) {
      return new Response(r.body, { status: 200, headers: { 'content-type': type, 'cache-control': 'private, max-age=3600', 'content-disposition': `inline; filename="santa-clip.mp4"` } });
    }
    r.body?.cancel();
    return json(200, { status: 'done', prompt: job.prompt });
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    if ([404, 422, 500].includes(r.status)) {
      await refund(env, kv, job, id);
      return json(200, { status: 'failed', error: 'That clip failed. Your cookies are back.' });
    }
    return json(200, { status: 'processing', progress: 0 });
  }
  if (data.status === 'COMPLETED') return json(200, { status: 'done', prompt: job.prompt });
  const progress = data.average_execution_time ? Math.min(0.97, data.execution_duration / data.average_execution_time) : 0;
  return json(200, { status: 'processing', progress });
}
