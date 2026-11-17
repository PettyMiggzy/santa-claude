// The 3D Santa: three.js scene with the Meshy model (rigged, 6 clips), neon
// lights, a glowing floor ring and falling snow. Listens on window for:
//   santa:act   detail: 'wave' | 'dance' | 'ymca' | 'cheer' | 'talk' | 'idle'
//   santa:talk  detail: true (start talking loop) | false (stop)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL_URL = '/models/santa.glb';
const CLIPS = {
  idle: 'Idle',
  wave: 'Big_Wave_Hello',
  dance: 'FunnyDancing_01',
  ymca: 'ymca_dance',
  cheer: 'Victory_Cheer',
  talk: 'Talk_with_Hands_Open',
};
const HEIGHT = 1.8; // world units the model is scaled to

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function initStage(root, { reduced = false, onProgress, onReady, onError } = {}) {
  const host = root.querySelector('[data-canvas]');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    onError?.(e);
    return null;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  const target = new THREE.Vector3(0, 0.86, 0);

  // lights: warm key, teal + purple rims, a red kicker
  scene.add(new THREE.HemisphereLight(0xcdeeff, 0x1a0b2e, 0.55));
  const key = new THREE.DirectionalLight(0xfff0e4, 2.1);
  key.position.set(-1.8, 3.5, 4.5);
  scene.add(key);
  const rimTeal = new THREE.DirectionalLight(0x2ff5d4, 4.2);
  rimTeal.position.set(-4, 2.2, -3);
  scene.add(rimTeal);
  const rimPurple = new THREE.DirectionalLight(0xa463ff, 4.2);
  rimPurple.position.set(4, 2.8, -3);
  scene.add(rimPurple);
  const kicker = new THREE.PointLight(0xff2e4d, 5, 7, 2);
  kicker.position.set(2.2, 0.5, 1.8);
  scene.add(kicker);

  // floor: soft shadow, glow disc, neon ring
  const floor = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 48),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(0,0,0,0.75)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false }),
  );
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(1.25, 64),
    new THREE.MeshBasicMaterial({ map: radialTexture('rgba(47,245,212,0.55)', 'rgba(47,245,212,0)'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.78, 0.805, 128),
    new THREE.MeshBasicMaterial({ color: 0x2ff5d4, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(1.02, 1.03, 128),
    new THREE.MeshBasicMaterial({ color: 0xa463ff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  [glow, shadow, ring, ring2].forEach((m, i) => {
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.002 + i * 0.001;
    floor.add(m);
  });
  scene.add(floor);

  // snow
  const SNOW = reduced ? 120 : 520;
  const snowPos = new Float32Array(SNOW * 3);
  const snowSeed = new Float32Array(SNOW);
  for (let i = 0; i < SNOW; i++) {
    snowPos[i * 3] = (Math.random() - 0.5) * 6;
    snowPos[i * 3 + 1] = Math.random() * 3.6;
    snowPos[i * 3 + 2] = (Math.random() - 0.5) * 4 - 0.5;
    snowSeed[i] = Math.random();
  }
  const snowGeo = new THREE.BufferGeometry();
  snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
  const snow = new THREE.Points(
    snowGeo,
    new THREE.PointsMaterial({
      size: 0.035,
      map: radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)'),
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      color: 0xdffcff,
    }),
  );
  scene.add(snow);

  // model
  const holder = new THREE.Group();
  scene.add(holder);
  let mixer = null;
  const actions = {};
  let current = null;
  let talking = false;
  let busyUntil = 0; // a one-shot clip is playing

  function fadeTo(name, { once = false, reps = 1, fade = 0.35 } = {}) {
    const next = actions[name];
    if (!next) return;
    if (current === next && !once) return;
    next.reset();
    next.enabled = true;
    next.setEffectiveTimeScale(1);
    next.setEffectiveWeight(1);
    if (once) {
      next.setLoop(THREE.LoopRepeat, reps);
      next.clampWhenFinished = true;
      busyUntil = performance.now() + (next.getClip().duration * reps * 1000) - fade * 1000;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    if (current && current !== next) next.crossFadeFrom(current, fade, true);
    next.play();
    current = next;
  }

  function settle() {
    fadeTo(talking ? 'talk' : 'idle');
  }

  function act(kind) {
    if (!mixer) return;
    if (kind === 'idle') return fadeTo('idle');
    if (kind === 'talk') {
      // as a button: talk for one loop and return
      return fadeTo('talk', { once: true, reps: 2 });
    }
    const reps = kind === 'dance' || kind === 'ymca' ? 2 : 1;
    fadeTo(kind, { once: true, reps });
  }

  // Keep clips in place: drop horizontal root motion so Santa stays on his ring.
  function pinRootMotion(clip) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.position')) continue;
      if (!/hips|root|pelvis/i.test(track.name)) continue;
      const v = track.values;
      const x0 = v[0];
      const z0 = v[2];
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0;
        v[i + 2] = z0;
      }
    }
    return clip;
  }

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.load(
    MODEL_URL,
    (gltf) => {
      const model = gltf.scene;
      model.traverse((o) => {
        if (o.isMesh) {
          o.frustumCulled = false;
          if (o.material) {
            o.material.envMapIntensity = 0.8;
          }
        }
      });
      holder.add(model);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const s = HEIGHT / (size.y || 1);
      model.scale.multiplyScalar(s);
      holder.updateMatrixWorld(true);
      box.setFromObject(model);
      const c = box.getCenter(new THREE.Vector3());
      model.position.x -= c.x;
      model.position.z -= c.z;
      model.position.y -= box.min.y;

      mixer = new THREE.AnimationMixer(model);
      for (const [k, clipName] of Object.entries(CLIPS)) {
        const clip = THREE.AnimationClip.findByName(gltf.animations, clipName);
        if (clip) actions[k] = mixer.clipAction(pinRootMotion(clip));
      }
      mixer.addEventListener('finished', settle);
      fadeTo('idle');
      if (!reduced) setTimeout(() => act('wave'), 600);
      onReady?.();
    },
    (e) => {
      if (e.total) onProgress?.(e.loaded / e.total);
    },
    (err) => onError?.(err),
  );

  // drag to spin (horizontal only; vertical swipes still scroll the page)
  let spin = 0;
  let spinVel = 0;
  let dragging = false;
  let lastX = 0;
  let lastInteract = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => {
    dragging = true;
    lastX = e.clientX;
    spinVel = 0;
    el.setPointerCapture?.(e.pointerId);
  });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    spinVel = dx * 0.012;
    spin += spinVel;
    lastInteract = performance.now();
  });
  const end = () => {
    dragging = false;
    lastInteract = performance.now();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('lostpointercapture', end);

  // sizing: keep the whole body in frame at any aspect ratio
  function resize() {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const needH = 2.55; // body + headroom + room for the buttons overlay
    const needW = 2.0; // arms + margin
    const dist = Math.max(needH / 2 / t, needW / 2 / (t * camera.aspect));
    camera.position.set(0, 1.05, dist);
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(host);
  resize();

  // render only when visible
  const clock = new THREE.Clock();
  let visible = true;
  let t = 0;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    mixer?.update(dt);

    if (!dragging) {
      spinVel *= 0.92;
      spin += spinVel;
      if (performance.now() - lastInteract > 2500) spin += (0 - spin) * 0.02; // drift back to face camera
    }
    holder.rotation.y = spin + (reduced ? 0 : Math.sin(t * 0.35) * 0.12);

    const pulse = 0.75 + Math.sin(t * 2.2) * 0.2;
    ring.material.opacity = pulse;
    ring2.rotation.z = t * 0.2;
    glow.material.opacity = 0.7 + Math.sin(t * 1.3) * 0.15;

    const p = snowGeo.attributes.position.array;
    for (let i = 0; i < SNOW; i++) {
      const s = snowSeed[i];
      p[i * 3 + 1] -= dt * (0.18 + s * 0.35);
      p[i * 3] += Math.sin(t * (0.6 + s) + s * 10) * dt * 0.08;
      if (p[i * 3 + 1] < 0) {
        p[i * 3 + 1] = 3.6;
        p[i * 3] = (Math.random() - 0.5) * 6;
      }
    }
    snowGeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
  }

  function updateLoop() {
    const run = visible && document.visibilityState === 'visible';
    renderer.setAnimationLoop(run ? frame : null);
    if (run) clock.getDelta();
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    updateLoop();
  }).observe(root);
  document.addEventListener('visibilitychange', updateLoop);
  updateLoop();

  window.addEventListener('santa:act', (e) => act(e.detail));
  window.addEventListener('santa:talk', (e) => {
    talking = !!e.detail;
    if (performance.now() < busyUntil) return; // let a wave/cheer finish first
    settle();
  });

  return { act };
}
