// The 3D Santa: three.js scene with the rigged model (7 clips), neon
// lights, a glowing floor ring and falling snow. Listens on window for:
//   santa:act   detail: 'wave' | 'dance' | 'ymca' | 'cheer' | 'talk' | 'idle'
//   santa:talk  detail: true (start talking loop) | false (stop)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const MODEL_URL = '/models/santa.glb';
// Clip names inside santa.glb (animation library ids 11, 290, 405, 61, 313, 596, 42).
const CLIPS = {
  idle: 'Idle_02',
  wave: 'Wave_One_Hand',
  dance: 'Joyful_Dance_with_Hand_Sway',
  ymca: 'ymca_dance',
  cheer: 'happy_jump_m',
  talk: 'Talk_with_Hands_Open',
  bow: 'Gentlemans_Bow',
  naughty: 'Draw_and_Shoot_from_Back',
  aim: 'Gun_Hold_Left_Turn',
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

  // ── props: gift sack by his feet, Naughty List blaster slung on his back ──
  let bones = {};
  let gun = null;
  let muzzle = null;
  let gunInHand = false;
  const V = () => new THREE.Vector3();
  const tA = V();
  const tB = V();
  const tC = V();
  const mBasis = new THREE.Matrix4();

  function normalized(obj, axis, size, { base = false } = {}) {
    const wrap = new THREE.Group();
    obj.traverse((o) => {
      if (o.isMesh) {
        o.frustumCulled = false;
        if (o.material) o.material.envMapIntensity = 0.8;
      }
    });
    wrap.add(obj);
    const box = new THREE.Box3().setFromObject(obj);
    const sz = box.getSize(V());
    obj.scale.multiplyScalar(size / (sz[axis] || 1));
    box.setFromObject(obj);
    const c = box.getCenter(V());
    obj.position.sub(base ? new THREE.Vector3(c.x, box.min.y, c.z) : c);
    return { wrap, box: box.getSize(V()) };
  }

  function loadProps() {
    loader.load('/models/sack.glb', (g) => {
      const { wrap } = normalized(g.scene, 'y', 0.78, { base: true });
      wrap.position.set(-0.72, 0, -0.18);
      wrap.rotation.y = 0.7;
      holder.add(wrap);
    });
    loader.load('/models/blaster.glb', (g) => {
      const { wrap, box } = normalized(g.scene, 'x', 0.95);
      // move the origin to the grip so the hand holds it there (muzzle points along -X)
      const inner = wrap.children[0];
      inner.position.x -= 0.13 * box.x;
      inner.position.y += 0.2 * box.y;
      muzzle = new THREE.Object3D();
      muzzle.position.set(-0.5 * box.x - 0.13 * box.x, 0.08 * box.y, 0);
      wrap.add(muzzle);
      gun = wrap;
      scene.add(gun);
      holster();
    });
  }

  function aimBasis(dir) {
    const x = tC.copy(dir).negate();
    const z = V().crossVectors(x, new THREE.Vector3(0, 1, 0)).normalize();
    const y = V().crossVectors(z, x).normalize();
    mBasis.makeBasis(x, y, z);
    return mBasis;
  }

  function holster() {
    if (!gun || !bones.spine) return;
    gunInHand = false;
    scene.attach(gun);
    holder.updateMatrixWorld(true);
    bones.spine.getWorldPosition(tA);
    // diagonally across his back, barrel up over the right shoulder
    const back = V().set(0, 0, -1).applyQuaternion(holder.quaternion);
    gun.position.copy(tA).addScaledVector(back, 0.2).add(V().set(0, 0.06, 0));
    const dir = V().set(0.32, 0.95, 0).applyQuaternion(holder.quaternion).normalize();
    const x = dir.clone().negate();
    const z = back.clone();
    const y = V().crossVectors(z, x).normalize();
    z.crossVectors(x, y).normalize();
    gun.quaternion.setFromRotationMatrix(mBasis.makeBasis(x, y, z));
    gun.position.addScaledVector(dir, -0.12);
    bones.spine.attach(gun);
    gun.visible = false; // stowed on his back, out of sight until he reaches for it
  }

  function gunToHand() {
    gunInHand = true;
    scene.attach(gun);
    gun.visible = true;
  }

  // ── the naughty sequence: draw (over-the-shoulder clip) → two-handed aim at the
  // viewer (rifle-hold pose) → three coal shots with recoil → holster
  const AIM = { switchAt: 0.42, pose: 0.06, hold: 2.6, shots: [0.55, 1.05, 1.55], offAxis: 0.55 };
  let naughty = null; // { phase: 'draw' | 'aim', t, fired }
  let aimYaw = 0; // extra turn so Santa faces the viewer while aiming
  let recoil = 0;
  let debugFreeze = false;

  function startAim() {
    const a = actions.aim;
    if (!a) return endNaughty();
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    a.time = AIM.pose * a.getClip().duration;
    a.paused = true; // hold the rifle stance
    a.crossFadeFrom(actions.naughty, 0.22, true);
    current = a;
    naughty = { phase: 'aim', t: 0, fired: 0 };
    busyUntil = performance.now() + AIM.hold * 1000;
  }

  function endNaughty() {
    naughty = null;
    holster();
    fadeTo(talking ? 'talk' : 'idle', { fade: 0.35 });
  }

  function followHand(dt) {
    bones.hand.getWorldPosition(tA);
    let dir;
    if (naughty?.phase === 'aim' && bones.lhand) {
      // aim line: from his chest out through his hands (both hands sit on the gun)
      bones.lhand.getWorldPosition(tB);
      const mid = V().addVectors(tA, tB).multiplyScalar(0.5);
      const chest = V();
      bones.spine.getWorldPosition(chest);
      dir = V().subVectors(mid, chest);
      dir.y = 0;
      dir.normalize();
      tA.copy(mid);
      // turn Santa so the barrel points at the viewer (a little off-axis so the gun reads)
      const camDir = V().subVectors(camera.position, tA).setY(0).normalize();
      const want = Math.atan2(camDir.x, camDir.z) + AIM.offAxis;
      const have = Math.atan2(dir.x, dir.z);
      let err = want - have;
      err = Math.atan2(Math.sin(err), Math.cos(err));
      aimYaw += err * Math.min(1, dt * 10);
      dir.y = THREE.MathUtils.clamp(dir.y, -0.12, 0.12);
      dir.normalize();
    } else {
      bones.fore.getWorldPosition(tB);
      dir = tB.subVectors(tA, tB).normalize();
    }
    gun.quaternion.setFromRotationMatrix(aimBasis(dir));
    gun.position.copy(tA).addScaledVector(dir, 0.03 - recoil * 0.08);
  }

  // coal + muzzle flash
  const coalGeo = new THREE.DodecahedronGeometry(0.035, 0);
  const coalMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1f, roughness: 0.9, metalness: 0.1, emissive: 0x220800 });
  const flashMat = new THREE.SpriteMaterial({ map: radialTexture('rgba(255,236,170,1)', 'rgba(255,120,40,0)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const flash = new THREE.Sprite(flashMat);
  flash.visible = false;
  scene.add(flash);
  const flashLight = new THREE.PointLight(0xffa860, 0, 4, 2);
  scene.add(flashLight);
  const coals = [];

  function fire() {
    if (!muzzle) return;
    muzzle.getWorldPosition(tA);
    flash.position.copy(tA);
    flash.scale.setScalar(0.45 + Math.random() * 0.2);
    flash.visible = true;
    flashLight.position.copy(tA);
    flashLight.intensity = 14;
    setTimeout(() => {
      flash.visible = false;
      flashLight.intensity = 0;
    }, 70);
    const toCam = V().subVectors(camera.position, tA).normalize();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(coalGeo, coalMat);
      m.position.copy(tA);
      const v = toCam.clone().multiplyScalar(5 + Math.random() * 3);
      v.x += (Math.random() - 0.5) * 2.2;
      v.y += (Math.random() - 0.2) * 1.6;
      scene.add(m);
      coals.push({ m, v, life: 0, spin: V().set(Math.random(), Math.random(), Math.random()).multiplyScalar(12) });
    }
    root.classList.remove('shake');
    void root.offsetWidth;
    root.classList.add('shake');
    window.dispatchEvent(new CustomEvent('santa:fire'));
  }

  function updateProps(dt) {
    if (naughty && gun && !debugFreeze) {
      if (naughty.phase === 'draw') {
        const a = actions.naughty;
        const f = a.time / a.getClip().duration;
        if (!gunInHand && f > 0.2) gunToHand();
        if (f >= AIM.switchAt) startAim();
      } else if (naughty.phase === 'aim') {
        naughty.t += dt;
        while (naughty.fired < AIM.shots.length && naughty.t >= AIM.shots[naughty.fired]) {
          naughty.fired++;
          recoil = 1;
          fire();
        }
        if (naughty.t >= AIM.hold) endNaughty();
      }
    }
    recoil *= Math.pow(0.0005, dt); // snappy recoil decay
    if (gun && gunInHand) followHand(dt);
    for (let i = coals.length - 1; i >= 0; i--) {
      const c = coals[i];
      c.life += dt;
      c.v.y -= 6 * dt;
      c.m.position.addScaledVector(c.v, dt);
      c.m.rotation.x += c.spin.x * dt;
      c.m.rotation.y += c.spin.y * dt;
      if (c.life > 1.4) {
        scene.remove(c.m);
        coals.splice(i, 1);
      }
    }
  }

  function act(kind) {
    if (!mixer) return;
    if (kind === 'idle') return fadeTo('idle');
    if (kind === 'naughty') {
      if (!actions.naughty || naughty) return;
      naughty = { phase: 'draw', t: 0, fired: 0 };
      return fadeTo('naughty', { once: true, reps: 1, fade: 0.2 });
    }
    if (kind === 'talk') {
      // as a button: talk for one loop and return
      return fadeTo('talk', { once: true, reps: 2 });
    }
    const reps = { dance: 1, ymca: 2, cheer: 2, wave: 1 }[kind] ?? 1;
    fadeTo(kind, { once: true, reps });
  }

  // Keep Santa on his ring without killing natural weight shifts: remove only the
  // net horizontal drift of the hips over the clip (a linear ramp), so the body can
  // still sway and the feet stay planted instead of sliding.
  function removeDrift(clip) {
    for (const track of clip.tracks) {
      if (!track.name.endsWith('.position')) continue;
      if (!/hips|root|pelvis/i.test(track.name)) continue;
      const v = track.values;
      const n = v.length / 3;
      if (n < 2) continue;
      const dx = v[(n - 1) * 3] - v[0];
      const dz = v[(n - 1) * 3 + 2] - v[2];
      for (let i = 0; i < n; i++) {
        const f = i / (n - 1);
        v[i * 3] -= dx * f;
        v[i * 3 + 2] -= dz * f;
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
        if (clip) actions[k] = mixer.clipAction(removeDrift(clip));
      }
      mixer.addEventListener('finished', (e) => {
        if (naughty) return; // the naughty sequence ends itself
        settle();
      });
      fadeTo('idle');
      bones = {
        hand: model.getObjectByName('RightHand'),
        lhand: model.getObjectByName('LeftHand'),
        fore: model.getObjectByName('RightForeArm'),
        spine: model.getObjectByName('Spine02'),
      };
      loadProps();
      if (!reduced) {
        // wave hello when the splash lifts, not behind it
        const hello = () => setTimeout(() => act('wave'), 500);
        if (document.documentElement.classList.contains('splashing')) window.addEventListener('santa:entered', hello, { once: true });
        else hello();
      }
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
    // cap only big hiccups (tab switches); slow devices still play at real speed
    const dt = Math.min(clock.getDelta(), 0.25);
    t += dt;
    mixer?.update(dt);

    if (!dragging) {
      spinVel *= 0.92;
      spin += spinVel;
      if (performance.now() - lastInteract > 2500) spin += (0 - spin) * 0.02; // drift back to face camera
    }
    if (!gunInHand) aimYaw *= 0.92; // turn back after holstering
    holder.rotation.y = spin + aimYaw;
    holder.position.z = -recoil * 0.05; // recoil kick

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

    if (mixer) {
      holder.updateMatrixWorld(true);
      updateProps(dt);
    }
    renderer.render(scene, camera);
  }

  function updateLoop() {
    // don't burn the GPU/CPU behind the splash; start when the visitor enters
    const run = visible && document.visibilityState === 'visible' && !document.documentElement.classList.contains('splashing');
    renderer.setAnimationLoop(run ? frame : null);
    if (run) clock.getDelta();
  }
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    updateLoop();
  }).observe(root);
  document.addEventListener('visibilitychange', updateLoop);
  window.addEventListener('santa:entered', updateLoop);
  updateLoop();

  window.addEventListener('santa:act', (e) => act(e.detail));
  window.addEventListener('santa:talk', (e) => {
    talking = !!e.detail;
    if (performance.now() < busyUntil) return; // let a wave/cheer finish first
    settle();
  });

  // ?debug: freeze any move at an exact point (used to check animations)
  if (new URLSearchParams(location.search).has('debug')) {
    window.__santa = {
      act,
      seek(kind, f) {
        // kind 'naughty' f<switchAt: draw phase; kind 'aim' f = seconds into the aim (0..hold)
        debugFreeze = true;
        mixer.stopAllAction();
        if (kind === 'aim') {
          naughty = { phase: 'draw' };
          gunToHand();
          actions.naughty.reset().play();
          startAim();
          mixer.update(0.3);
          actions.naughty.stop();
          naughty.t = f;
          recoil = 0;
          mixer.timeScale = 0;
          return true;
        }
        const a = actions[kind];
        if (!a) return false;
        naughty = null;
        a.reset().play();
        a.setEffectiveWeight(1);
        current = a;
        if (kind === 'naughty') {
          naughty = { phase: 'draw' };
          if (f > 0.2) gunToHand();
          else holster();
        } else holster();
        a.time = f * a.getClip().duration;
        mixer.timeScale = 0;
        mixer.update(0);
        return true;
      },
      clips: () => Object.keys(actions),
      state: () => ({
        current: current?.getClip().name,
        naughty,
        aimYaw,
        weights: Object.fromEntries(Object.entries(actions).map(([k, a]) => [k, +a.getEffectiveWeight().toFixed(2)])),
        running: Object.entries(actions).filter(([, a]) => a.isRunning()).map(([k]) => k),
      }),
    };
  }

  return { act };
}
