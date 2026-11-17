// Vercel serverless function: POST /api/chat
// Web-signature handler (Request -> Response), as in Vercel's Node.js runtime docs.
// handleChat answers non-POST requests with 405 itself.
import { handleChat } from '../server/santa.js';

export default {
  fetch(request) {
    return handleChat(request, process.env);
  },
};
