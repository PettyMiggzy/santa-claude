// Regenerate the 3D Santa with Meshy: art → clean reference → 3D → rig → animations → web GLB.
//
//   MESHY_API_KEY=msy_... npm run make-santa
//   MESHY_API_KEY=msy_... npm run make-santa -- --ref art/santa-fullbody-reference.png   (skip step 1)
//
// Output: scripts/out/ (raw files) and public/models/santa.glb (compressed, what the site loads).
// Costs roughly 70–100 Meshy credits per full run.
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
const REF_PROMPT =
  'Redraw this exact character as a clean full-body 3D character reference for 3D modeling. Show the entire character from the top of the Santa hat down to the black boots, standing upright and symmetrical in a relaxed A-pose, arms slightly away from the body, facing the camera straight on (front view). Keep the identical design: cyborg Santa Claus with a segmented grey metal-plated robotic face, glowing teal eyes, big fluffy white beard and moustache, red Santa hat with white fur trim and pom-pom, round black headphones with the purple-teal three-bar logo on each ear, red velvet coat with thick white fur trim, glowing teal round chest emblem with a christmas tree icon, black belt, robotic chrome hands, black boots. Plain flat light grey background, soft even studio lighting, no shadows on the background, no holograms, no floating UI panels, no text, no props. Stylized high-quality 3D game character render.';

// Meshy animation library ids: GET /openapi/v1/animations/library?search=wave
// Clip names in the GLB must match CLIPS in src/stage.js.
const ACTIONS = [0 /* Idle */, 28 /* Big Wave Hello */, 22 /* Funny Dancing 1 */, 59 /* Victory Cheer */, 313 /* Talk with Hands Open */, 596 /* YMCA */];

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
}

await mkdir(OUT, { recursive: true });
const refArg = process.argv.indexOf('--ref');

// 1. clean full-body reference (or use one you pass in)
let i23dInput;
if (refArg > -1) {
  i23dInput = { image_url: await dataUri(process.argv[refArg + 1]) };
} else {
  const ref = await task(
    'image-to-image',
    { ai_model: 'gpt-image-2', prompt: REF_PROMPT, reference_image_urls: await Promise.all(SOURCE_ART.map(dataUri)), aspect_ratio: '2:3' },
    '1/4 reference image',
  );
  await download(ref.image_urls[0], `${OUT}/reference.png`);
  i23dInput = { input_task_id: ref.id };
}

// 2. image → textured 3D model
const model = await task(
  'image-to-3d',
  {
    ...i23dInput,
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
  '2/4 image to 3D',
);
await download(model.model_urls.glb, `${OUT}/santa_static.glb`);

// 3. rig
const rig = await task('rigging', { input_task_id: model.id, height_meters: 1.8 }, '3/4 rigging');

// 4. animations, merged into one GLB (one clip per action)
const anim = await task('animations', { rig_task_id: rig.id, action_ids: ACTIONS }, '4/4 animations');
await download(anim.result.animation_glb_url, `${OUT}/santa_animated_raw.glb`);

// 5. compress for the web (meshopt + webp textures)
console.log('compressing…');
execFileSync(
  'npx',
  ['-y', '@gltf-transform/cli@4.1.1', 'optimize', `${OUT}/santa_animated_raw.glb`, 'public/models/santa.glb', '--compress', 'meshopt', '--texture-compress', 'webp', '--texture-size', '1024', '--simplify', 'false'],
  { stdio: 'inherit' },
);
console.log('\n✓ public/models/santa.glb updated. Run `npm run dev` to see him.');
