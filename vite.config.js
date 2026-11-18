import { defineConfig, loadEnv } from 'vite';
import { handleChat } from './server/santa.js';
import { handleSpeak } from './server/speak.js';
import { handleAuth, handleMe } from './server/routes.js';
import { handleClip } from './server/clip.js';

const ROUTES = { '/api/chat': handleChat, '/api/speak': handleSpeak, '/api/auth': handleAuth, '/api/me': handleMe, '/api/clip': handleClip };
import { nodeHandler } from './server/node-adapter.js';

// In `npm run dev`, serve /api/chat and /api/speak from the same handlers Vercel uses.
function santaApi(env) {
  return {
    name: 'santa-api',
    configureServer(server) {
      for (const [path, fn] of Object.entries(ROUTES)) server.middlewares.use(path, nodeHandler((req) => fn(req, env)));
    },
    configurePreviewServer(server) {
      for (const [path, fn] of Object.entries(ROUTES)) server.middlewares.use(path, nodeHandler((req) => fn(req, env)));
    },
  };
}

export default defineConfig(({ mode }) => {
  // Load .env / .env.local (all keys, not only VITE_*) for the dev API only.
  // Nothing from here is exposed to the browser bundle.
  const env = { ...process.env, ...loadEnv(mode, process.cwd(), '') };
  return {
    plugins: [santaApi(env)],
    build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  };
});
