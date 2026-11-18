// Production server for any Node host (Render, Railway, Fly, a VPS...).
// Not needed on Vercel, which serves dist/ and api/ by itself.
//   npm run build && npm start
import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleChat } from './server/santa.js';
import { handleSpeak } from './server/speak.js';
import { nodeHandler } from './server/node-adapter.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const port = Number(process.env.PORT) || 3000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
};

const chat = nodeHandler((req) => handleChat(req, process.env));
const speak = nodeHandler((req) => handleSpeak(req, process.env));

async function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.join(root, path.normalize(rel));
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  let target = file;
  let st = await stat(target).catch(() => null);
  if (!st || !st.isFile()) {
    target = path.join(root, 'index.html');
    st = await stat(target).catch(() => null);
    if (!st) {
      res.writeHead(404).end('Not found. Did you run `npm run build`?');
      return;
    }
  }
  const ext = path.extname(target);
  res.writeHead(200, {
    'content-type': TYPES[ext] || 'application/octet-stream',
    'content-length': st.size,
    'cache-control': rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
    'x-content-type-options': 'nosniff',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(target).pipe(res);
}

http
  .createServer((req, res) => {
    if (req.url.startsWith('/api/chat')) return chat(req, res);
    if (req.url.startsWith('/api/speak')) return speak(req, res);
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405).end();
    serveStatic(req, res).catch(() => res.writeHead(500).end());
  })
  .listen(port, () => console.log(`Santa Claude is listening on http://localhost:${port}`));
