/**
 * Reading and rewriting a .vrm as what it actually is: a binary glTF.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS HAND-ROLLED AND NOT gltf-transform
 * ---------------------------------------------------------------------------
 * A VRM 0.x file carries its own extension block — `extensions.VRM` — and that
 * block addresses the rest of the file BY INDEX. `materialProperties[n]` lines
 * up positionally with `materials[n]`; `textureProperties` holds texture
 * indices; `blendShapeMaster` binds expressions to `{mesh, index}` pairs where
 * `index` is a morph target's position in its primitive's `targets` array;
 * `meta.texture` is a texture index; `humanoid.humanBones` hold node indices.
 *
 * A general glTF optimiser does not know any of that. It sees textures that no
 * standard material references, prunes them, renumbers what is left, and hands
 * back a file whose VRM block now points at the wrong things — which does not
 * throw, and does not show up until she renders with her outline texture as her
 * skin. That is the failure this module exists to make impossible.
 *
 * THE RULE, AND IT IS THE WHOLE DESIGN: every array the VRM block can index
 * into — images, textures, materials, accessors, meshes, nodes — keeps its
 * length and its order. Nothing is ever removed from them and nothing is ever
 * reordered. `bufferViews` is the single exception, because it is the one array
 * nothing outside `accessors` and `images` refers to, and it is also the only
 * one that has to change for the file to get smaller.
 *
 * An accessor whose data is no longer wanted therefore stays in the array and
 * simply loses its `bufferView`, which the spec defines as "initialized with
 * zeros" rather than as an error. That is how a morph target's normals leave
 * without the expression that binds to them moving an index.
 */

export const GLB_MAGIC = 0x46546c67; // 'glTF'
export const JSON_CHUNK = 0x4e4f534a; // 'JSON'
export const BIN_CHUNK = 0x004e4942; // 'BIN\0'

export const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
export const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/** Round up to the next multiple of four. glTF aligns every chunk and every view. */
export const align4 = (n) => n + ((4 - (n % 4)) % 4);

/**
 * Split a GLB into its JSON and BIN halves.
 *
 * `bin` is a view INTO the file buffer rather than a copy — every read in this
 * pipeline is a subarray of it, so nothing here ever holds two copies of an
 * 18MB model.
 */
export function parseGlb(buf) {
  if (buf.length < 12 || buf.readUInt32LE(0) !== GLB_MAGIC) {
    throw new Error('not a binary glTF: magic bytes are wrong');
  }
  const end = Math.min(buf.readUInt32LE(8), buf.length);

  let json = null;
  let bin = null;
  let offset = 12;
  while (offset + 8 <= end) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'));
    else if (type === BIN_CHUNK) bin = data;
    // Chunk lengths are required to be four-byte aligned, so this is normally a
    // no-op. It is here for the exporters that emit the unpadded length and pad
    // the stream anyway.
    offset = align4(offset + 8 + length);
  }
  if (!json) throw new Error('no JSON chunk');
  if (!bin) throw new Error('no BIN chunk');
  return { json, bin };
}

/** Reassemble a GLB. The JSON chunk pads with spaces, the BIN chunk with zeros. */
export function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLen = align4(jsonBuf.length);
  const binLen = align4(bin.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;

  const out = Buffer.alloc(total);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);

  let o = 12;
  out.writeUInt32LE(jsonLen, o);
  out.writeUInt32LE(JSON_CHUNK, o + 4);
  jsonBuf.copy(out, o + 8);
  out.fill(0x20, o + 8 + jsonBuf.length, o + 8 + jsonLen);
  o += 8 + jsonLen;

  out.writeUInt32LE(binLen, o);
  out.writeUInt32LE(BIN_CHUNK, o + 4);
  bin.copy(out, o + 8);
  return out;
}

/** The bytes a bufferView covers, as a view into `bin`. */
export function viewBytes(json, bin, index) {
  const view = json.bufferViews[index];
  const start = view.byteOffset ?? 0;
  return bin.subarray(start, start + view.byteLength);
}

/**
 * The bytes one accessor covers, copied into a fresh four-byte-aligned buffer.
 *
 * Copied rather than viewed because the caller wants to read floats out of it,
 * and a subarray of the file inherits the file's alignment — a Float32Array over
 * an offset that is not a multiple of four throws.
 *
 * Returns null for an accessor that is interleaved, already sparse, or has no
 * data at all. Every caller here treats null as "leave this one alone", which is
 * the right answer for all three.
 */
export function accessorBytes(json, bin, index) {
  const accessor = json.accessors[index];
  if (!accessor || accessor.bufferView === undefined || accessor.sparse) return null;
  const elementSize = COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type];
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? elementSize;
  if (stride !== elementSize) return null;

  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const length = elementSize * accessor.count;
  const out = new Uint8Array(length);
  out.set(bin.subarray(start, start + length));
  return out;
}

const TYPED_ARRAYS = {
  5120: Int8Array, 5121: Uint8Array, 5122: Int16Array,
  5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array,
};

/**
 * One accessor's values, as the loader will see them.
 *
 * Resolves the two indirections a raw byte read misses: an accessor with no
 * bufferView reads as zeros, and a sparse accessor substitutes its values over
 * whatever that base was. Interleaved accessors are de-interleaved.
 *
 * This is what makes the verifier a check rather than a restatement — it walks
 * the same three cases the loader does and compares the RESULT, not the storage.
 */
export function accessorValues(json, bin, index) {
  const accessor = json.accessors[index];
  const components = TYPE_COMPONENTS[accessor.type];
  const TypedArray = TYPED_ARRAYS[accessor.componentType];
  const elementSize = COMPONENT_BYTES[accessor.componentType] * components;
  const out = new TypedArray(accessor.count * components);

  if (accessor.bufferView !== undefined) {
    const view = json.bufferViews[accessor.bufferView];
    const stride = view.byteStride ?? elementSize;
    const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    for (let i = 0; i < accessor.count; i += 1) {
      const row = new Uint8Array(elementSize);
      row.set(bin.subarray(base + i * stride, base + i * stride + elementSize));
      out.set(new TypedArray(row.buffer), i * components);
    }
  }

  if (accessor.sparse) {
    const { indices, values } = accessor.sparse;
    const IndexArray = TYPED_ARRAYS[indices.componentType];
    const indexView = json.bufferViews[indices.bufferView];
    const indexBase = (indexView.byteOffset ?? 0) + (indices.byteOffset ?? 0);
    const indexBytes = new Uint8Array(accessor.sparse.count * COMPONENT_BYTES[indices.componentType]);
    indexBytes.set(bin.subarray(indexBase, indexBase + indexBytes.length));
    const rows = new IndexArray(indexBytes.buffer);

    const valueView = json.bufferViews[values.bufferView];
    const valueBase = (valueView.byteOffset ?? 0) + (values.byteOffset ?? 0);
    const valueBytes = new Uint8Array(accessor.sparse.count * elementSize);
    valueBytes.set(bin.subarray(valueBase, valueBase + valueBytes.length));
    const substitutions = new TypedArray(valueBytes.buffer);

    for (let n = 0; n < accessor.sparse.count; n += 1) {
      for (let c = 0; c < components; c += 1) {
        out[rows[n] * components + c] = substitutions[n * components + c];
      }
    }
  }

  return out;
}

/** Every accessor index something still reads from. */
export function referencedAccessors(json) {
  const used = new Set();
  const add = (i) => { if (typeof i === 'number') used.add(i); };

  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      add(prim.indices);
      for (const v of Object.values(prim.attributes ?? {})) add(v);
      for (const target of prim.targets ?? []) for (const v of Object.values(target)) add(v);
    }
  }
  for (const skin of json.skins ?? []) add(skin.inverseBindMatrices);
  for (const animation of json.animations ?? []) {
    for (const sampler of animation.samplers ?? []) { add(sampler.input); add(sampler.output); }
  }
  return used;
}

/**
 * Texture indices that a material actually samples.
 *
 * Deliberately a walk of the whole document rather than a list of the glTF
 * texture slots, because in a VRM most of them are not glTF slots at all: the
 * sphere-add map, the rim map and the outline width map live in
 * `extensions.VRM.materialProperties[].textureProperties`, which is a plain
 * object of name to texture index. Missing those is how a "safe" prune deletes
 * a model's outlines.
 *
 * `extensions.VRM.meta` is not walked, since the thumbnail it points at is the
 * one texture this pipeline is allowed to throw away.
 */
export function texturesUsedByMaterials(json) {
  const used = new Set();

  const walk = (node, key) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const v of node) walk(v, key); return; }
    if (key === 'textureProperties') {
      for (const v of Object.values(node)) if (typeof v === 'number') used.add(v);
      return;
    }
    if (/Texture$/.test(key ?? '') && typeof node.index === 'number') used.add(node.index);
    for (const [k, v] of Object.entries(node)) walk(v, k);
  };

  walk(json.materials, 'materials');
  walk(json.extensions?.VRM?.materialProperties, 'materialProperties');
  walk(json.extensions?.VRMC_materials_mtoon, 'VRMC_materials_mtoon');
  return used;
}

/**
 * The image this model declares as its thumbnail, or null.
 *
 * 0.x points at a TEXTURE and 1.0 points at an IMAGE, which is the sort of
 * difference that makes a one-line lookup wrong on half the cast.
 */
export function thumbnailImage(json) {
  const v1 = json.extensions?.VRMC_vrm?.meta?.thumbnailImage;
  if (typeof v1 === 'number') return v1;
  const texture = json.extensions?.VRM?.meta?.texture;
  if (typeof texture === 'number' && texture >= 0) {
    const source = json.textures?.[texture]?.source;
    return typeof source === 'number' ? source : null;
  }
  return null;
}

/**
 * Rebuild the BIN chunk from whatever the bufferViews now say, dropping the
 * views nothing points at any more.
 *
 * This is the only place indices move, and only `bufferViews` indices move.
 * Views are re-emitted in their original relative order, so a diff of the
 * rewritten JSON stays readable.
 *
 * @param {object} json mutated in place: bufferViews, and the accessor and image
 *   references into them
 * @param {(index: number) => Uint8Array} bytesFor the content of the old view
 *   `index` — which is how a re-encoded image is substituted for its PNG
 * @returns {Buffer} the new BIN chunk
 */
export function repack(json, bytesFor) {
  const live = new Set();
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView !== undefined) live.add(accessor.bufferView);
    if (accessor.sparse) {
      live.add(accessor.sparse.indices.bufferView);
      live.add(accessor.sparse.values.bufferView);
    }
  }
  for (const image of json.images ?? []) {
    if (image.bufferView !== undefined) live.add(image.bufferView);
  }

  const remap = new Map();
  const chunks = [];
  const views = [];
  let offset = 0;
  for (let i = 0; i < json.bufferViews.length; i += 1) {
    if (!live.has(i)) continue;
    const bytes = bytesFor(i);
    const old = json.bufferViews[i];
    const next = { buffer: 0, byteOffset: offset, byteLength: bytes.length };
    if (old.byteStride !== undefined) next.byteStride = old.byteStride;
    if (old.target !== undefined) next.target = old.target;
    if (old.name !== undefined) next.name = old.name;
    remap.set(i, views.length);
    views.push(next);
    chunks.push(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
    const padding = align4(bytes.length) - bytes.length;
    if (padding) chunks.push(Buffer.alloc(padding));
    offset += align4(bytes.length);
  }

  const moved = (index) => {
    const next = remap.get(index);
    if (next === undefined) throw new Error(`bufferView ${index} was dropped but is still referenced`);
    return next;
  };
  for (const accessor of json.accessors ?? []) {
    if (accessor.bufferView !== undefined) accessor.bufferView = moved(accessor.bufferView);
    if (accessor.sparse) {
      accessor.sparse.indices.bufferView = moved(accessor.sparse.indices.bufferView);
      accessor.sparse.values.bufferView = moved(accessor.sparse.values.bufferView);
    }
  }
  for (const image of json.images ?? []) {
    if (image.bufferView !== undefined) image.bufferView = moved(image.bufferView);
  }

  json.bufferViews = views;
  json.buffers = [{ byteLength: offset }];
  return Buffer.concat(chunks);
}
