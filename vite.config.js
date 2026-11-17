import { defineConfig, loadEnv } from 'vite';
import { handleChat } from './server/santa.js';
import { nodeHandler } from './server/node-adapter.js';

// In `npm run dev`, serve /api/chat from the same handler Vercel uses.
function santaApi(env) {
  return {
    name: 'santa-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', nodeHandler((req) => handleChat(req, env)));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', nodeHandler((req) => handleChat(req, env)));
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
