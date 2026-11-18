// Santa Clips: POST /api/clip { prompt } -> { id };  GET /api/clip?id= -> status;  GET /api/clip?id=&file=1 -> mp4
import { handleClip } from '../server/clip.js';

export default {
  fetch(request) {
    return handleClip(request, process.env);
  },
};
