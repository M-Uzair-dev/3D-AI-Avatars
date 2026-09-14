/**
 * Reading a VRM's own metadata out of the file, without loading the model.
 *
 * A .vrm is a GLB: a 12-byte header, then length-prefixed chunks, the first of
 * which is the glTF JSON. Everything we want — the character's name, its author
 * and its licence terms — is in that JSON, a few hundred bytes into a file that
 * is otherwise twenty megabytes of mesh and texture. So the model picker can
 * label ten models without downloading any of them.
 *
 * Pure, per the lib/ boundary: it takes bytes and returns a plain object. The
 * API route supplies the bytes; nothing here knows about the filesystem.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT ONE PROPERTY READ
 * ---------------------------------------------------------------------------
 * VRM 1.0 renamed every field in the meta block and changed `author` from a
 * string to an `authors` array. This is the one place in the codebase that
 * KNOWS about the version split, and it exists so that nothing else has to:
 * invariant 10 says never branch on VRM version, and the reason that rule works
 * everywhere else is that three-vrm normalizes names at load time. Nothing
 * normalizes the meta block, because we are deliberately not loading the model.
 */

const MAGIC_GLTF = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;

/** The glTF JSON of a GLB, or null if these bytes are not one. */
function gltfJson(bytes) {
  if (!bytes || bytes.length < 20) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== MAGIC_GLTF) return null;
  if (view.getUint32(16, true) !== CHUNK_JSON) return null;

  const length = view.getUint32(12, true);
  if (length <= 0 || 20 + length > bytes.length) return null;
  try {
    return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  } catch {
    return null;
  }
}

/**
 * Name, author and the licence facts that actually constrain use.
 *
 * Only two licence fields are surfaced, and both were chosen because they can
 * stop a model being used at all rather than because they are interesting:
 *
 *   authorOnly  nobody but the author may use this avatar
 *   commercial  whether it may appear in a product
 *
 * Everything else in the meta block is a link or a nuance, and belongs in front
 * of a human reading the original rather than in a picker.
 */
export function parseVrmMeta(bytes) {
  const empty = {
    spec: null, name: '', author: '', authorOnly: false, commercial: false,
  };

  const json = gltfJson(bytes);
  if (!json) return empty;

  const v1 = json.extensions?.VRMC_vrm;
  const v0 = json.extensions?.VRM;
  const meta = v1?.meta ?? v0?.meta;
  if (!meta) return empty;

  // 0.x: 'Everyone' | 'ExplicitlyLicensedPerson' | 'OnlyAuthor'
  // 1.0: 'everyone' | 'onlyseparatelylicensedperson' | 'onlyauthor'
  const permission = String(meta.avatarPermission ?? meta.allowedUserName ?? '').toLowerCase();
  // 0.x: 'Allow' | 'Disallow'.  1.0: 'personalNonProfit' | 'corporation' | ...
  const commercial = String(meta.commercialUsage ?? meta.commercialUssageName ?? '').toLowerCase();

  return {
    spec: v1 ? '1.0' : '0.x',
    name: meta.name ?? meta.title ?? '',
    author: Array.isArray(meta.authors) ? meta.authors.join(', ') : (meta.author ?? ''),
    authorOnly: permission === 'onlyauthor',
    commercial: commercial === 'allow' || commercial === 'corporation'
      || commercial === 'personalprofit',
  };
}

/**
 * What to call a model in the picker.
 *
 * Four of the ten models here declare no title at all, so falling back to the
 * filename is the ordinary case rather than the edge case — which is also why
 * the files were renamed off `model2 (7).vrm` in the first place.
 */
export function modelLabel(file, meta) {
  return meta?.name?.trim() || file.replace(/\.vrm$/i, '');
}
