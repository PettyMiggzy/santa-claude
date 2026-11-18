// Vercel serverless function: POST /api/speak (Santa's voice)
import { handleSpeak } from '../server/speak.js';

export default {
  fetch(request) {
    return handleSpeak(request, process.env);
  },
};
