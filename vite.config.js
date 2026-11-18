import { defineConfig, loadEnv } from 'vite';
import { handleChat } from './server/santa.js';
import { handleSpeak } from './server/speak.js';
import { nodeHandler } from './server/node-adapter.js';

// In `npm run dev`, serve /api/chat and /api/speak from the same handlers Vercel uses.
function santaApi(env) {
  return {
    name: 'santa-api',
    configureServer(server) {
      server.middlewares.use('/api/chat', nodeHandler((req) => handleChat(req, env)));
      server.middlewares.use('/api/speak', nodeHandler((req) => handleSpeak(req, env)));
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/chat', nodeHandler((req) => handleChat(req, env)));
      server.middlewares.use('/api/speak', nodeHandler((req) => handleSpeak(req, env)));
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
