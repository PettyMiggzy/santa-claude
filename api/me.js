// GET /api/me -> the visitor's tier, cookies left today, and burn stats.
import { handleMe } from '../server/routes.js';

export default {
  fetch(request) {
    return handleMe(request, process.env);
  },
};
