// Vercel serverless function: POST /api/chat
import { handleChat } from '../server/santa.js';

export async function POST(request) {
  return handleChat(request, process.env);
}

export async function GET() {
  return new Response(JSON.stringify({ error: 'POST only' }), {
    status: 405,
    headers: { 'content-type': 'application/json', allow: 'POST' },
  });
}
