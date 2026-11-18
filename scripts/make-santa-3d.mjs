// Regenerate the 3D Santa with Meshy:
//   art → stocky front reference → side + back views → 3D from all views → rig → animations → web GLB
//
//   MESHY_API_KEY=msy_... npm run make-santa
//   MESHY_API_KEY=msy_... npm run make-santa -- --ref art/santa-fullbody-reference.png   (reuse a front reference)
//
// Why several views: a 3D model built from one front image has to guess depth, which
// gave the first Santa paper-thin arms when he turned. Side and back views fix that.
//
// Output: scripts/out/ (raw files) and public/models/santa.glb (compressed, what the site loads).
// Costs roughly 80–100 Meshy credits per full run.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const KEY = process.env.MESHY_API_KEY;
if (!KEY) {
  console.error('Set MESHY_API_KEY first (see .env.example).');
  process.exit(1);
}
const API = 'https://api.meshy.ai/openapi/v1';
const OUT = 'scripts/out';
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

const SOURCE_ART = ['art/santa-holo.jpg', 'art/santa-matrix.jpg'];
const FRONT_PROMPT =
  'Redraw this exact character as a clean full-body 3D game character reference, front view, but fix the proportions: a stout, barrel-chested, heavyset Santa Claus with a big round belly and broad shoulders, about 5 heads tall. The arms must be SHORT and THICK: chunky round upper arms and forearms with puffy red velvet sleeves and fat white fur cuffs, hands only reaching the hips, never below them. Short sturdy legs, big chunky black boots. Standing straight in a relaxed A-pose with both arms angled about 40 degrees out from the body, a clear empty gap between each arm and the torso, palms facing down, fingers together. Keep the identical design: segmented grey metal-plated robotic face, glowing teal eyes, big fluffy white beard and moustache, red Santa hat with white fur trim and pom-pom, round black headphones with the purple-teal three-bar logo on each ear, red coat with thick white fur trim, glowing teal round chest emblem with a christmas tree icon, black belt with buckle, robotic chrome hands. Every body part is solid, round and volumetric, nothing flat or thin. Plain flat light grey background, soft even studio lighting, no shadow on the background, no text, no props. Stylized high-quality 3D render.';
const VIEWS_PROMPT =
  'Show this exact same character from several angles for 3D modeling: front view, left side profile view, and back view. Identical design, identical stocky proportions, identical A-pose with short thick arms angled out from the body, full body from hat to boots in every view. The side view must show the real thickness of the round belly, the chunky arms and the beard. Plain flat light grey background, even studio lighting, no text, no props.';

// Calm, natural clips from the Meshy library (GET /openapi/v1/animations/library?search=wave).
// The clip names they produce must match CLIPS in src/stage.js.
const ACTIONS = [11 /* Idle 1 */, 290 /* Wave One Hand */, 405 /* Joyful Dance with Hand Sway */, 298 /* Cheer with Both Hands Up */, 313 /* Talk with Hands Open */, 596 /* YMCA */];

const dataUri = async (file) => {
  const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
  return `data:image/${ext};base64,${(await readFile(file)).toString('base64')}`;
};

async function task(endpoint, body, label) {
  const r = await fetch(`${API}/${endpoint}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${label}: ${r.status} ${JSON.stringify(j)}`);
  const id = j.result;
  process.stdout.write(`${label} (${id}) `);
  for (;;) {
    await new Promise((s) => setTimeout(s, 8000));
    const t = await (await fetch(`${API}/${endpoint}/${id}`, { headers: H })).json();
    if (t.status === 'SUCCEEDED') {
      console.log(`done, ${t.consumed_credits ?? '?'} credits`);
      return t;
    }
    if (t.status === 'FAILED' || t.status === 'CANCELED') throw new Error(`${label} ${t.status}: ${JSON.stringify(t.task_error)}`);
    process.stdout.write(`${t.progress ?? 0}% `);
  }
}

async function download(url, file) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download ${file}: ${r.status}`);
  await writeFile(file, Buffer.from(await r.arrayBuffer()));
  console.log('saved', file);
  return file;
}

await mkdir(OUT, { recursive: true });
const refArg = process.argv.indexOf('--ref');

// 1. stocky front reference (or reuse one you pass in)
let frontFile;
if (refArg > -1) {
  frontFile = process.argv[refArg + 1];
} else {
  const front = await task(
    'image-to-image',
    { ai_model: 'gpt-image-2', prompt: FRONT_PROMPT, reference_image_urls: await Promise.all(SOURCE_ART.map(dataUri)), aspect_ratio: '2:3' },
    '1/5 front reference',
  );
  frontFile = await download(front.image_urls[0], `${OUT}/front.png`);
}

// 2. side + back views of the same character
const views = await task(
  'image-to-image',
  { ai_model: 'gpt-image-2', prompt: VIEWS_PROMPT, reference_image_urls: [await dataUri(frontFile)], generate_multi_view: true },
  '2/5 side + back views',
);
const viewFiles = [];
for (const [i, u] of views.image_urls.entries()) viewFiles.push(await download(u, `${OUT}/view_${i}.png`));

// 3. 3D from all views. The first image is treated as the front; we use the high-res
//    front, then the generated views except their own front (view_0).
const images = [frontFile, ...viewFiles.slice(1)].slice(0, 4);
const model = await task(
  'multi-image-to-3d',
  {
    image_urls: await Promise.all(images.map(dataUri)),
    ai_model: 'latest',
    should_texture: true,
    enable_pbr: true,
    texture_resolution: '2k',
    should_remesh: true,
    topology: 'triangle',
    target_polycount: 60000,
    pose_mode: 'a-pose',
    target_formats: ['glb'],
  },
  '3/5 multi-image to 3D',
);
await download(model.model_urls.glb, `${OUT}/santa_static.glb`);

// 4. rig
const rig = await task('rigging', { input_task_id: model.id, height_meters: 1.7 }, '4/5 rigging');

// 5. animations, merged into one GLB (one clip per action)
const anim = await task('animations', { rig_task_id: rig.id, action_ids: ACTIONS }, '5/5 animations');
await download(anim.result.animation_glb_url, `${OUT}/santa_animated_raw.glb`);

// compress for the web (meshopt + webp textures)
console.log('compressing…');
execFileSync(
  'npx',
  ['-y', '@gltf-transform/cli@4.1.1', 'optimize', `${OUT}/santa_animated_raw.glb`, 'public/models/santa.glb', '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'],
  { stdio: 'inherit' },
);
console.log('\n✓ public/models/santa.glb updated. Run `npm run dev` to see him.');
