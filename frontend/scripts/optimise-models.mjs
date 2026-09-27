/**
 * Make the models small enough to arrive.
 *
 * ---------------------------------------------------------------------------
 * WHY
 * ---------------------------------------------------------------------------
 * Every model in public/ was ~18MB, and the five committed ones were 87MB of
 * static assets. That is the whole of "it takes too long to show something": a
 * cold visitor waits for 18MB before anything but a progress bar exists, and
 * the warm-up queue then pulls the rest of the cast behind her.
 *
 * Measuring one (free-1.vrm, 17.5MiB) said where it all was:
 *
 *   9.23MB  38 PNG textures, of which 2.09MB is the VRM metadata Thumbnail
 *   2.72MB  morph target POSITION deltas — 57 blendshapes
 *   2.72MB  morph target NORMAL deltas
 *   1.90MB  skin weights, positions, normals, UVs
 *   0.62MB  indices
 *
 * So the geometry was never the problem. Four passes, in descending order of
 * what they are worth:
 *
 *   1. TEXTURES TO WEBP. 9.4MB of PNG becomes ~0.8MB. Each image is encoded
 *      both ways and the smaller wins, so a texture that lossless compresses
 *      better than lossy — the flat two-colour masks do — takes the lossless
 *      one and loses nothing at all.
 *
 *   2. THE THUMBNAIL GOES. A 2048x2048 portrait inside every model that nothing
 *      in this app has ever drawn: `meta.texture` is read by VRM editors to show
 *      a preview tile. Replaced with a 1x1 transparent PNG rather than deleted,
 *      because deleting it would renumber `images` and `textures` and the VRM
 *      block indexes into both. 67 bytes is cheaper than that risk.
 *
 *   3. MORPH NORMALS GO. This is the one pass with a visible consequence, so it
 *      is the one to reach for if something looks wrong: her normals now stay at
 *      the rest pose while her face deforms. On an MToon surface, whose shading
 *      is a two-tone ramp rather than a specular response, that is somewhere
 *      between subtle and invisible — but it is not nothing, and
 *      `--keep-morph-normals` puts them back.
 *
 *   4. MORPH POSITIONS GO SPARSE. A blendshape for a blink moves the eyelids and
 *      leaves the other four thousand vertices alone, and glTF has a
 *      representation for exactly that. Not quite lossless — VRoid writes float
 *      noise rather than zeros, so "alone" needs a threshold — but the largest
 *      delta discarded anywhere in the cast is 0.00999mm against a largest kept
 *      delta of 72mm. `sparsifyMorph` below has the full measurement, and
 *      `verify-models.mjs` re-derives it from the written files.
 *
 * A model whose own licence forbids modification is copied through untouched.
 * One of the eight says exactly that; see `modificationAllowed`.
 *
 * ---------------------------------------------------------------------------
 * WHAT THIS DOES NOT DO
 * ---------------------------------------------------------------------------
 * KTX2/Basis, which is the one that would also cut VRAM. A WebP still decodes to
 * the same RGBA surface on the GPU as the PNG did, so this pass makes the models
 * DOWNLOAD five times faster and leaves what they cost once resident exactly
 * where it was — which is the number docs/11 flags for a thermally tight
 * machine. KTX2 needs a `toktx` binary in the build environment, so it is a
 * separate job, not a flag away.
 *
 * It also does not deduplicate across models. The same 2.82MB body texture ships
 * byte-identically in all five committed models — 11.29MB of the 87MB was one
 * image five times — but after pass 1 that image is ~98KB, so hoisting it into a
 * shared file would now save under half a megabyte in exchange for loading
 * textures outside the GLB. Not worth it; recorded so the next person does not
 * re-derive it.
 *
 *   npm run models:optimise          # originals in assets-source -> public/
 *   npm run models:optimise -- --dry # print the table, write nothing
 *
 * Re-runnable: it reads the pristine originals from assets-source/, never the
 * optimised files it wrote last time.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import {
  align4,
  accessorBytes,
  parseGlb,
  referencedAccessors,
  repack,
  texturesUsedByMaterials,
  thumbnailImage,
  viewBytes,
  writeGlb,
} from './lib/glb.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = resolve(HERE, '..');
const DEFAULT_IN = resolve(FRONTEND, '..', 'assets-source', 'models-original');
const DEFAULT_OUT = resolve(FRONTEND, 'public');

const FLOAT = 5126;
const USHORT = 5123;
const UINT = 5125;

/**
 * Extensions that would make the repack wrong rather than merely unoptimised.
 *
 * Both of these hide geometry inside bufferViews in a form this pipeline cannot
 * read, and Draco additionally moves the accessor-to-bufferView relationship
 * into the extension. Neither appears in any model here — the cast declares
 * VRM, KHR_texture_transform and KHR_materials_unlit — so this is a tripwire for
 * a model dropped in later, not a case to handle.
 */
const REFUSED_EXTENSIONS = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression'];

const mib = (n) => (n / 1048576).toFixed(2);

/**
 * Does this model's own licence permit being rewritten at all?
 *
 * ---------------------------------------------------------------------------
 * WHY A SIZE PIPELINE HAS A LICENCE CHECK IN IT
 * ---------------------------------------------------------------------------
 * Because one of the eight says no, and it was optimised anyway before anybody
 * looked. `untitled-6.vrm` (Yuki) carries `modification=disallow`, and
 * re-encoding her textures is a modification whatever the intent was. She is also
 * `redistribution=disallow`, so she never leaves this machine and the practical
 * exposure was nil — which is exactly the reasoning that makes a licence flag get
 * ignored, so it is not the reasoning used here.
 *
 * This project has already learnt the general shape of that lesson once: a VRM's
 * permissions are SEPARATE FLAGS and answering one does not answer another. See
 * public/ASSETS.md and `npm run licences`.
 *
 * The flag is not a field. VRM 0.x has no `modification` key in `meta` — it lives
 * in the query string of the VRoid Hub `otherPermissionUrl` the model points at,
 * alongside `redistribution`, which is where lib/vrmMeta.js reads its own
 * redistribution answer from too. A model that states nothing is treated as
 * permitting it, which matches how the rest of the project reads a silent file.
 */
function modificationAllowed(json) {
  const meta = json.extensions?.VRM?.meta ?? json.extensions?.VRMC_vrm?.meta ?? {};
  const url = meta.otherPermissionUrl ?? meta.otherLicenseUrl ?? meta.licenseUrl ?? '';
  return !/modification=disallow/i.test(String(url));
}

function parseArgs(argv) {
  const args = {
    in: DEFAULT_IN, out: DEFAULT_OUT, quality: 90,
    morphNormals: false, sparse: true, epsilon: 1e-5, dry: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--in') args.in = resolve(argv[i += 1]);
    else if (arg === '--out') args.out = resolve(argv[i += 1]);
    else if (arg === '--quality') args.quality = Number(argv[i += 1]);
    else if (arg === '--morph-epsilon') args.epsilon = Number(argv[i += 1]);
    else if (arg === '--keep-morph-normals') args.morphNormals = true;
    else if (arg === '--no-sparse') args.sparse = false;
    else if (arg === '--dry') args.dry = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  return args;
}

/**
 * The smaller of the two WebP encodings, or the original if neither wins.
 *
 * Alpha is compressed losslessly even in the lossy mode (`alphaQuality: 100`),
 * which is what makes q90 safe on the hair and eyelash cutouts: MToon alpha-tests
 * those, and a soft edge there reads as a halo round her fringe.
 */
async function recompress(bytes, quality) {
  const source = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const candidates = await Promise.all([
    sharp(source).webp({ lossless: true, effort: 5 }).toBuffer(),
    sharp(source).webp({ quality, alphaQuality: 100, effort: 5, smartSubsample: true }).toBuffer(),
  ]);
  const best = candidates.reduce((a, b) => (b.length < a.length ? b : a));
  return best.length < bytes.byteLength ? { bytes: best, mimeType: 'image/webp' } : null;
}

/**
 * Rewrite one morph-target accessor as a sparse one, if that is smaller.
 *
 * ---------------------------------------------------------------------------
 * WHY THERE IS A THRESHOLD AND NOT AN EXACT ZERO TEST
 * ---------------------------------------------------------------------------
 * The first cut tested the raw bits, so the round trip was bit-exact and the
 * verifier could assert byte equality. It saved nothing: measured across the
 * cast, EVERY vertex of EVERY blendshape has a bit-nonzero delta, and the sparse
 * form came out LARGER than the dense one (3.17MB against 2.72MB on free-1).
 * VRoid writes noise, not zeros, and one shape was -0.0 on all four thousand
 * vertices.
 *
 * So the test is a magnitude threshold, in model units, which means metres. At
 * the default 1e-5 the numbers are these, measured on all eight models:
 *
 *   largest delta discarded    0.00999 mm
 *   largest delta kept         72 mm
 *   vertices kept              17-21%
 *   2.7MB of morph deltas   -> 0.58MB
 *
 * A ratio of 7200:1 between the biggest thing thrown away and the biggest thing
 * kept is what makes this safe, and `verify-models.mjs` re-derives the discarded
 * figure from the written files rather than trusting this comment. Raise
 * `--morph-epsilon` to trade more of her face for fewer bytes; there is no
 * reason to.
 *
 * @returns {{outcome: 'zero'|'sparse', dropped: number}|null} the largest
 *   magnitude discarded, for the report
 */
function sparsifyMorph(json, bin, accessorIndex, addView, epsilon) {
  const accessor = json.accessors[accessorIndex];
  if (accessor.type !== 'VEC3' || accessor.componentType !== FLOAT || accessor.sparse) return null;
  const bytes = accessorBytes(json, bin, accessorIndex);
  if (!bytes) return null;

  const values = new Float32Array(bytes.buffer, 0, accessor.count * 3);
  const rows = [];
  let dropped = 0;
  for (let i = 0; i < accessor.count; i += 1) {
    const magnitude = Math.max(
      Math.abs(values[i * 3]),
      Math.abs(values[i * 3 + 1]),
      Math.abs(values[i * 3 + 2]),
    );
    if (magnitude > epsilon) rows.push(i);
    else if (magnitude > dropped) dropped = magnitude;
  }

  // A blendshape that moves nothing — VRoid ships several, some of them written
  // as -0.0 on every vertex — needs no storage at all. An accessor with no
  // bufferView reads as zeros, which is exactly the content.
  if (rows.length === 0) {
    delete accessor.bufferView;
    delete accessor.byteOffset;
    return { outcome: 'zero', dropped };
  }

  const dense = accessor.count * 12;
  const indexType = accessor.count - 1 <= 0xffff ? USHORT : UINT;
  const indexSize = indexType === USHORT ? 2 : 4;
  const sparseSize = align4(rows.length * indexSize) + rows.length * 12;
  // Ten per cent of nothing is not worth a second bufferView and the loader work
  // to resolve it.
  if (sparseSize >= dense * 0.9) return null;

  const indexBytes = new Uint8Array(rows.length * indexSize);
  const indexView = new DataView(indexBytes.buffer);
  rows.forEach((row, n) => {
    if (indexType === USHORT) indexView.setUint16(n * indexSize, row, true);
    else indexView.setUint32(n * indexSize, row, true);
  });

  const valueBytes = new Uint8Array(rows.length * 12);
  rows.forEach((row, n) => valueBytes.set(bytes.subarray(row * 12, row * 12 + 12), n * 12));

  delete accessor.bufferView;
  delete accessor.byteOffset;
  accessor.sparse = {
    count: rows.length,
    indices: { bufferView: addView(indexBytes), byteOffset: 0, componentType: indexType },
    values: { bufferView: addView(valueBytes), byteOffset: 0 },
  };
  return { outcome: 'sparse', dropped };
}

async function optimise(buf, args) {
  const { json, bin } = parseGlb(buf);

  if (!modificationAllowed(json)) return { buf, report: null };

  for (const name of REFUSED_EXTENSIONS) {
    if ((json.extensionsUsed ?? []).includes(name)) {
      throw new Error(`${name} is present and this pipeline cannot rewrite it safely`);
    }
  }
  if ((json.buffers ?? []).length !== 1) {
    throw new Error(`expected one buffer, found ${(json.buffers ?? []).length}`);
  }
  if ((json.bufferViews ?? []).some((v) => (v.buffer ?? 0) !== 0)) {
    throw new Error('a bufferView points at a buffer other than the BIN chunk');
  }

  // Substituted content, keyed by the OLD bufferView index. repack() asks this
  // first and falls back to the file, which is how a re-encoded image and a
  // freshly minted sparse index buffer travel the same path.
  const override = new Map();
  const addView = (bytes) => {
    const index = json.bufferViews.length;
    json.bufferViews.push({ buffer: 0, byteOffset: 0, byteLength: bytes.length });
    override.set(index, bytes);
    return index;
  };

  const report = {
    images: 0, imagesBefore: 0, imagesAfter: 0, thumbnail: 0,
    morphNormals: 0, sparse: 0, zeroed: 0, dropped: 0,
  };

  // Two images sharing one bufferView would mean two substitutions racing for
  // one slot, and the loser would be decoded as the winner's bytes. No exporter
  // does this and nothing in the cast does it; it is cheaper to refuse than to
  // find out from a model wearing another model's face.
  const imageViews = (json.images ?? []).map((i) => i.bufferView).filter((v) => v !== undefined);
  if (new Set(imageViews).size !== imageViews.length) {
    throw new Error('two images share a bufferView');
  }

  // ── 1 & 2. textures ───────────────────────────────────────────────────────
  const thumbnail = thumbnailImage(json);
  const materialTextures = texturesUsedByMaterials(json);
  const thumbnailIsShared = thumbnail !== null
    && (json.textures ?? []).some((t, i) => t.source === thumbnail && materialTextures.has(i));
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .png({ compressionLevel: 9 })
    .toBuffer();

  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView === undefined) continue;
    const bytes = viewBytes(json, bin, image.bufferView);
    report.imagesBefore += bytes.length;

    if (index === thumbnail && !thumbnailIsShared) {
      override.set(image.bufferView, tiny);
      image.mimeType = 'image/png';
      report.thumbnail += bytes.length - tiny.length;
      report.imagesAfter += tiny.length;
      continue;
    }
    if (image.mimeType !== 'image/png' && image.mimeType !== 'image/jpeg') {
      report.imagesAfter += bytes.length;
      continue;
    }

    const encoded = await recompress(bytes, args.quality);
    if (!encoded) {
      report.imagesAfter += bytes.length;
      continue;
    }
    override.set(image.bufferView, encoded.bytes);
    // No EXT_texture_webp declaration, deliberately. three.js builds the image
    // blob from `mimeType` and decodes whatever the browser can, so this is all
    // it needs; declaring the extension would also mean declaring it REQUIRED
    // (there is no PNG left to fall back to), which turns any loader without
    // WebP support from "slightly wrong" into "refuses the file".
    image.mimeType = encoded.mimeType;
    report.images += 1;
    report.imagesAfter += encoded.bytes.length;
  }

  // ── 3. morph normals ──────────────────────────────────────────────────────
  if (!args.morphNormals) {
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives ?? []) {
        for (const target of prim.targets ?? []) {
          for (const key of ['NORMAL', 'TANGENT']) {
            if (target[key] !== undefined) { delete target[key]; report.morphNormals += 1; }
          }
        }
      }
    }
  }

  // Any accessor nothing reads any more loses its data but keeps its index —
  // see the header of lib/glb.mjs for why that distinction is the whole design.
  const referenced = referencedAccessors(json);
  for (const [index, accessor] of (json.accessors ?? []).entries()) {
    if (!referenced.has(index) && accessor.bufferView !== undefined) {
      delete accessor.bufferView;
      delete accessor.byteOffset;
    }
  }

  // ── 4. sparse morph positions ─────────────────────────────────────────────
  if (args.sparse) {
    const seen = new Set();
    for (const mesh of json.meshes ?? []) {
      for (const prim of mesh.primitives ?? []) {
        for (const target of prim.targets ?? []) {
          const accessorIndex = target.POSITION;
          if (accessorIndex === undefined || seen.has(accessorIndex)) continue;
          seen.add(accessorIndex);
          const result = sparsifyMorph(json, bin, accessorIndex, addView, args.epsilon);
          if (!result) continue;
          if (result.outcome === 'sparse') report.sparse += 1;
          else report.zeroed += 1;
          report.dropped = Math.max(report.dropped, result.dropped);
        }
      }
    }
  }

  const rebuilt = repack(json, (index) => override.get(index) ?? viewBytes(json, bin, index));
  return { buf: writeGlb(json, rebuilt), report };
}

const args = parseArgs(process.argv.slice(2));
if (!existsSync(args.in)) {
  console.error(`No originals at ${args.in}`);
  console.error('This reads pristine models and writes optimised ones; it will not optimise in place.');
  process.exit(1);
}
await mkdir(args.out, { recursive: true });

const files = (await readdir(args.in)).filter((f) => f.toLowerCase().endsWith('.vrm')).sort();
if (files.length === 0) {
  console.error(`No .vrm files in ${args.in}`);
  process.exit(1);
}

console.log(`${files.length} models: ${args.in}\n                 -> ${args.out}${args.dry ? '  (dry run)' : ''}\n`);
console.log('                     before     after  saved    textures        blendshapes');
let totalBefore = 0;
let totalAfter = 0;
let worstDropped = 0;
let skipped = 0;
for (const file of files) {
  const source = await readFile(join(args.in, file));
  const { buf, report } = await optimise(source, args);
  totalBefore += source.length;
  totalAfter += buf.length;

  // Copied through untouched rather than skipped, so public/ still ends up with
  // a complete cast. The original IS the output for this one.
  if (!report) {
    if (!args.dry) await writeFile(join(args.out, file), buf);
    console.log(`${file.padEnd(18)}${mib(source.length).padStart(7)}MB   left alone — its licence says modification=disallow`);
    skipped += 1;
    continue;
  }

  worstDropped = Math.max(worstDropped, report.dropped);
  if (!args.dry) await writeFile(join(args.out, file), buf);
  const saved = (100 * (1 - buf.length / source.length)).toFixed(0);
  console.log(
    `${file.padEnd(18)}${mib(source.length).padStart(7)}MB${mib(buf.length).padStart(8)}MB`
    + `${(`${saved}%`).padStart(6)}  `
    + `${mib(report.imagesBefore)}->${mib(report.imagesAfter)}MB  `
    + `${String(report.sparse).padStart(3)} sparse ${String(report.zeroed).padStart(2)} empty`
    + `${String(report.morphNormals).padStart(5)} normals dropped`,
  );
}
console.log(
  `\n${'total'.padEnd(18)}${mib(totalBefore).padStart(7)}MB${mib(totalAfter).padStart(8)}MB`
  + `${(`${(100 * (1 - totalAfter / totalBefore)).toFixed(0)}%`).padStart(6)}`,
);
// The number that says whether the blendshape threshold was honest. Anything in
// the thousandths of a millimetre is noise; a figure approaching a millimetre
// means --morph-epsilon has been raised too far and her face is being edited.
console.log(`largest blendshape delta discarded: ${(worstDropped * 1000).toExponential(2)}mm`);
if (skipped) console.log(`${skipped} model(s) left at original size by their own licence.`);
if (args.dry) console.log('\nNothing was written.');
else console.log('\nNow run: npm run models:verify');
