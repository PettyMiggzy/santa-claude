// Bridge Node's (req, res) to a web-standard handler (Request -> Response).
import { Readable } from 'node:stream';

const MAX_BODY = 64 * 1024;

export async function toWebRequest(req) {
  const chunks = [];
  let size = 0;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const c of req) {
      size += c.length;
      if (size > MAX_BODY) throw Object.assign(new Error('Body too large'), { status: 413 });
      chunks.push(c);
    }
  }
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
    else if (v != null) headers.set(k, v);
  }
  if (!headers.get('x-forwarded-for') && req.socket?.remoteAddress) {
    headers.set('x-forwarded-for', req.socket.remoteAddress);
  }
  return new Request(`http://${req.headers.host || 'localhost'}${req.url}`, {
    method: req.method,
    headers,
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

export async function sendWebResponse(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) return res.end();
  Readable.fromWeb(response.body).pipe(res);
}

export function nodeHandler(handler) {
  return async (req, res) => {
    try {
      const request = await toWebRequest(req);
      const response = await handler(request);
      await sendWebResponse(res, response);
    } catch (err) {
      res.statusCode = err.status || 500;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ error: err.status === 413 ? 'Too long' : 'Server error' }));
    }
  };
}
