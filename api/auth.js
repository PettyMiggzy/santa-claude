// Sign in with a Solana wallet.
//   GET    /api/auth  -> { nonce, issued }   (stateless, HMAC-signed)
//   POST   /api/auth  { address, nonce, issued, signature(base64) } -> session cookie
//   DELETE /api/auth  -> sign out
import { handleAuth } from '../server/routes.js';

export default {
  fetch(request) {
    return handleAuth(request, process.env);
  },
};
