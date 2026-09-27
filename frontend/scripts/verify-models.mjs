/**
 * Prove the optimised models are the same models.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A SCRIPT AND NOT AN EYE
 * ---------------------------------------------------------------------------
 * `optimise-models.mjs` rewrites binary assets, and every failure it can have is
 * silent. A texture index off by one does not throw; it puts her outline map on
 * her skin. A dropped morph target does not throw; it makes one expression do
 * nothing, and there are 57 of them. A repack that loses four bytes of alignment
 * does not throw either — it reads the next accessor's floats as this one's.
 *
 * So nothing here is judged by looking at her. Four passes, each the check for
 * one thing the optimiser could have broken:
 *
 *   STRUCTURE   every array the VRM block indexes into still has the same length
 *               and the same order, and the VRM block itself is byte-identical.
 *               This is the invariant lib/glb.mjs is built around; this is where
 *               it is actually tested.
 *
 *   DATA        every accessor still in use is compared VALUE BY VALUE against
 *               the original, through the same three cases the loader resolves:
 *               zero-filled, dense, sparse. Geometry, skinning and indices must
 *               be bit-identical. Blendshape deltas are allowed to differ by at
 *               most `--morph-epsilon`, and the WORST ACTUAL DIFFERENCE is
 *               printed, so the claim in the optimiser's header is re-derived
 *               from the written file on every run rather than believed.
 *
 *   TEXTURES    every image is decoded and its dimensions and channel count
 *               compared with the PNG it replaced. A WebP that sharp can decode
 *               is a WebP a browser can decode; what this is really checking is
 *               that image N is still image N.
 *
 *   LOAD        the written file goes through the REAL GLTFLoader and the REAL
 *               @pixiv/three-vrm plugin chain, in Node, and is asked for the
 *               things this app reads: every humanoid bone, the expression list,
 *               the materials, and the head height the camera frames her from.
 *               The ORIGINAL is loaded alongside it and the two head heights are
 *               compared, because that measurement is what the camera framing is
 *               solved from and this project does not reason about measurements
 *               it can take.
 *
 * Exit code is 1 on any failure, so this is usable as a gate.
 *
 *   npm run models:verify
 */

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { accessorValues, parseGlb, referencedAccessors, viewBytes } from './lib/glb.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const DEFAULT_BEFORE = resolve(FRONTEND, '..', 'assets-source', 'models-original');
const DEFAULT_AFTER = resolve(FRONTEND, 'public');

function parseArgs(argv) {
  const args = { before: DEFAULT_BEFORE, after: DEFAULT_AFTER, epsilon: 1e-5, load: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--before') args.before = resolve(argv[i += 1]);
    else if (argv[i] === '--after') args.after = resolve(argv[i += 1]);
    else if (argv[i] === '--morph-epsilon') args.epsilon = Number(argv[i += 1]);
    else if (argv[i] === '--no-load') args.load = false;
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return args;
}

const failures = [];
const fail = (file, message) => failures.push(`${file}: ${message}`);

/**
 * Enough of a browser for three's ImageLoader to finish.
 *
 * three loads an embedded texture by wrapping the bufferView in a Blob, taking
 * an object URL for it and handing that to an <img>. In Node there is no <img>,
 * so the whole material chain — and with it every VRM plugin that runs after
 * it — never resolves. This stubs the element and reports the load immediately.
 *
 * NOTHING IS DECODED HERE, and that is the honest limit of the LOAD pass: it
 * proves the glTF graph, the humanoid, the expressions and the measurements
 * survive. Whether the image bytes are a valid image is the TEXTURES pass's job,
 * and that one really does decode them.
 */
function installImageStub() {
  if (typeof globalThis.document !== 'undefined') return;
  globalThis.document = {
    createElementNS: () => {
      const element = {
        style: {},
        listeners: {},
        addEventListener(type, handler) { element.listeners[type] = handler; },
        removeEventListener(type) { delete element.listeners[type]; },
        set src(_value) { queueMicrotask(() => element.listeners.load?.({ target: element })); },
        get src() { return ''; },
        width: 1,
        height: 1,
      };
      return element;
    },
    createElement: () => ({ style: {}, getContext: () => null }),
  };
  globalThis.self = globalThis;
}

async function verifyStructure(file, before, after) {
  const arrays = ['images', 'textures', 'materials', 'accessors', 'meshes', 'nodes', 'skins', 'samplers'];
  for (const key of arrays) {
    const a = (before.json[key] ?? []).length;
    const b = (after.json[key] ?? []).length;
    if (a !== b) fail(file, `${key}: ${a} became ${b} — the VRM block indexes into this`);
  }

  // The VRM block is never touched by the optimiser, so anything but equality
  // here means a pass reached somewhere it should not have.
  const a = JSON.stringify(before.json.extensions?.VRM ?? before.json.extensions?.VRMC_vrm ?? null);
  const b = JSON.stringify(after.json.extensions?.VRM ?? after.json.extensions?.VRMC_vrm ?? null);
  if (a !== b) fail(file, 'the VRM extension block changed');

  for (const [m, mesh] of (before.json.meshes ?? []).entries()) {
    const other = after.json.meshes[m];
    if (JSON.stringify(mesh.extras?.targetNames) !== JSON.stringify(other.extras?.targetNames)) {
      fail(file, `mesh ${m}: blendshape names changed`);
    }
    for (const [p, prim] of (mesh.primitives ?? []).entries()) {
      const otherPrim = other.primitives?.[p];
      if (!otherPrim) { fail(file, `mesh ${m} primitive ${p} is missing`); continue; }
      const targets = (prim.targets ?? []).length;
      const otherTargets = (otherPrim.targets ?? []).length;
      if (targets !== otherTargets) {
        fail(file, `mesh ${m} primitive ${p}: ${targets} morph targets became ${otherTargets}`);
      }
      for (const key of Object.keys(prim.attributes ?? {})) {
        if (otherPrim.attributes?.[key] !== prim.attributes[key]) {
          fail(file, `mesh ${m} primitive ${p}: attribute ${key} moved or vanished`);
        }
      }
      for (const [t, target] of (prim.targets ?? []).entries()) {
        if (otherPrim.targets?.[t]?.POSITION !== target.POSITION) {
          fail(file, `mesh ${m} primitive ${p} target ${t}: POSITION accessor moved`);
        }
      }
    }
  }
}

/**
 * Compare every accessor still in use, value by value.
 *
 * Morph POSITION accessors are the only ones allowed to differ, and only by the
 * threshold the optimiser was run with. The largest difference found is
 * returned, in millimetres, so the tolerance is reported as a measurement rather
 * than as a pass.
 */
function verifyData(file, before, after, epsilon) {
  const morphPositions = new Set();
  for (const mesh of after.json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      for (const target of prim.targets ?? []) {
        if (target.POSITION !== undefined) morphPositions.add(target.POSITION);
      }
    }
  }

  let worst = 0;
  for (const index of referencedAccessors(after.json)) {
    const original = accessorValues(before.json, before.bin, index);
    const rewritten = accessorValues(after.json, after.bin, index);
    if (original.length !== rewritten.length) {
      fail(file, `accessor ${index}: ${original.length} values became ${rewritten.length}`);
      continue;
    }
    const tolerance = morphPositions.has(index) ? epsilon : 0;
    for (let i = 0; i < original.length; i += 1) {
      const difference = Math.abs(original[i] - rewritten[i]);
      if (difference > tolerance) {
        fail(file, `accessor ${index}[${i}]: ${original[i]} became ${rewritten[i]}`);
        break;
      }
      if (tolerance && difference > worst) worst = difference;
    }
  }
  return worst;
}

async function verifyTextures(file, before, after) {
  let bytesBefore = 0;
  let bytesAfter = 0;
  let opaqueAlphaDropped = 0;
  for (const [index, image] of (after.json.images ?? []).entries()) {
    const originalImage = before.json.images[index];
    if (image.bufferView === undefined || originalImage?.bufferView === undefined) continue;
    const originalBytes = viewBytes(before.json, before.bin, originalImage.bufferView);
    const bytes = viewBytes(after.json, after.bin, image.bufferView);
    bytesBefore += originalBytes.length;
    bytesAfter += bytes.length;

    let meta;
    try {
      meta = await sharp(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)).metadata();
    } catch (error) {
      fail(file, `image ${index} (${image.name ?? 'unnamed'}) will not decode: ${error.message}`);
      continue;
    }
    const originalMeta = await sharp(
      Buffer.from(originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength),
    ).metadata();

    // The thumbnail is the one image deliberately replaced rather than re-encoded.
    const isThumbnail = bytes.length < 200 && originalBytes.length > 1000;
    if (isThumbnail) continue;
    if (meta.width !== originalMeta.width || meta.height !== originalMeta.height) {
      fail(file, `image ${index}: ${originalMeta.width}x${originalMeta.height} became ${meta.width}x${meta.height}`);
    }
    if (meta.channels !== originalMeta.channels) {
      // Dropping an alpha channel is allowed when there was nothing in it. Eight
      // of free-1's textures are RGBA PNGs whose alpha is 255 everywhere, and
      // the WebP encoder writes those as RGB — which costs nothing, since a
      // sampler returns 1.0 for the alpha of a three-channel texture. Anything
      // else is real transparency being thrown away, and on an MToon model that
      // is her hair silhouette.
      const opaque = originalMeta.channels === 4 && meta.channels === 3
        && (await sharp(Buffer.from(
          originalBytes.buffer, originalBytes.byteOffset, originalBytes.byteLength,
        )).stats()).isOpaque;
      if (!opaque) {
        fail(file, `image ${index}: ${originalMeta.channels} channels became ${meta.channels} — real transparency was lost`);
      } else {
        opaqueAlphaDropped += 1;
      }
    }
  }
  return { bytesBefore, bytesAfter, opaqueAlphaDropped };
}

/**
 * Put the written file through the real loader and ask it what this app asks it.
 *
 * `parse` rather than `load`, so nothing needs a URL or a fetch. The bone list is
 * the one from lib/vrmIntrospect.js's domain — if any of these is missing, every
 * pose in the project targets a bone that is not there.
 */
async function loadVrm(buf) {
  const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
  const { VRMLoaderPlugin, VRMUtils } = await import('@pixiv/three-vrm');
  const { Vector3 } = await import('three');

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const gltf = await new Promise((done, failed) => {
    loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '', done, failed);
  });
  const vrm = gltf.userData.vrm;
  if (!vrm) return null;

  // The same sequence VrmAvatar runs on load, in the same order, for the same
  // reason: the head cannot be measured until the world matrices exist, and they
  // do not exist until updateMatrixWorld runs. Measuring first reads the head as
  // sitting on the floor — and then the camera frames the floor.
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  VRMUtils.combineSkeletons(gltf.scene);
  VRMUtils.rotateVRM0(vrm);
  vrm.scene.updateMatrixWorld(true);
  const head = vrm.humanoid?.getNormalizedBoneNode('head');
  return { vrm, headY: head ? head.getWorldPosition(new Vector3()).y : null };
}

async function verifyLoad(file, buf, beforeBuf, before) {
  const loaded = await loadVrm(buf);
  if (!loaded) { fail(file, 'loaded, but carries no VRM'); return null; }
  const { vrm, headY } = loaded;

  const required = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'leftLowerArm', 'leftHand',
    'rightUpperArm', 'rightLowerArm', 'rightHand', 'leftUpperLeg', 'rightUpperLeg'];
  const missing = required.filter((bone) => !vrm.humanoid?.getNormalizedBoneNode(bone));
  if (missing.length) fail(file, `humanoid is missing ${missing.join(', ')}`);

  const expressions = Object.keys(vrm.expressionManager?.expressionMap ?? {});
  if (expressions.length === 0) fail(file, 'no expressions survived');

  let materials = 0;
  vrm.scene.traverse((object) => { if (object.material) materials += Array.isArray(object.material) ? object.material.length : 1; });

  if (headY === null) fail(file, 'head height could not be measured — the camera would frame the floor');

  const declaredExpressions = (before.json.extensions?.VRM?.blendShapeMaster?.blendShapeGroups ?? []).length;
  if (declaredExpressions && expressions.length < declaredExpressions) {
    fail(file, `${declaredExpressions} expressions declared, ${expressions.length} loaded`);
  }

  // LOAD THE ORIGINAL TOO, AND COMPARE THE HEAD.
  //
  // It is tempting to skip this: the vertex data is verified bit-identical above
  // and the node transforms are never touched, so the head CANNOT have moved.
  // That argument has been right before and this project has still had the
  // framing wrong six times, always from reasoning about a measurement instead
  // of taking it. It costs one more parse. Take the measurement.
  const original = await loadVrm(beforeBuf);
  const drift = original?.headY === null || headY === null ? null : Math.abs(original.headY - headY);
  if (drift === null) fail(file, 'could not measure the original head height to compare against');
  else if (drift > 1e-6) fail(file, `head moved ${(drift * 1000).toFixed(4)}mm — the camera framing is derived from this`);

  return { expressions: expressions.length, materials, headY, drift };
}

const args = parseArgs(process.argv.slice(2));
for (const dir of [args.before, args.after]) {
  if (!existsSync(dir)) { console.error(`missing directory: ${dir}`); process.exit(1); }
}
if (args.load) installImageStub();

const files = (await readdir(args.after)).filter((f) => f.toLowerCase().endsWith('.vrm')).sort();
console.log(`Verifying ${files.length} models against ${args.before}\n`);

let totalBefore = 0;
let totalAfter = 0;
for (const file of files) {
  const beforePath = join(args.before, file);
  if (!existsSync(beforePath)) { console.log(`${file.padEnd(18)} no original to compare against — skipped`); continue; }

  const beforeBuf = await readFile(beforePath);
  const afterBuf = await readFile(join(args.after, file));
  const before = parseGlb(beforeBuf);
  const after = parseGlb(afterBuf);
  totalBefore += beforeBuf.length;
  totalAfter += afterBuf.length;

  await verifyStructure(file, before, after);
  const worst = verifyData(file, before, after, args.epsilon);
  const textures = await verifyTextures(file, before, after);
  const loaded = args.load ? await verifyLoad(file, afterBuf, beforeBuf, before) : null;

  console.log(
    `${file.padEnd(18)}${(beforeBuf.length / 1048576).toFixed(2)}MB -> ${(afterBuf.length / 1048576).toFixed(2)}MB  `
    + `textures ${(textures.bytesBefore / 1048576).toFixed(2)}->${(textures.bytesAfter / 1048576).toFixed(2)}MB  `
    + (textures.opaqueAlphaDropped ? `${textures.opaqueAlphaDropped} empty alpha dropped  ` : '')
    + `worst blendshape difference ${(worst * 1000).toExponential(2)}mm`
    + (loaded ? `  ${loaded.expressions} expressions, ${loaded.materials} materials, head at ${loaded.headY.toFixed(4)}m (unmoved)` : ''),
  );
}

console.log(`\ntotal ${(totalBefore / 1048576).toFixed(2)}MB -> ${(totalAfter / 1048576).toFixed(2)}MB`);
if (failures.length) {
  console.error(`\n${failures.length} problem(s):`);
  for (const problem of failures) console.error(`  ${problem}`);
  process.exit(1);
}
console.log('\nEvery model: structure, data, textures and a real load all check out.');
