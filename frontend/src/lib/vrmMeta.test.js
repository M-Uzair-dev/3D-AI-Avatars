import { describe, it, expect } from 'vitest';
import { parseVrmMeta, modelLabel } from './vrmMeta.js';

/** Build a minimal GLB whose JSON chunk is `json`. */
function glb(json) {
  const body = new TextEncoder().encode(JSON.stringify(json));
  // Chunks must be 4-byte aligned; the spec pads JSON with spaces.
  const padded = new Uint8Array(Math.ceil(body.length / 4) * 4).fill(0x20);
  padded.set(body);

  const bytes = new Uint8Array(20 + padded.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(padded, 20);
  return bytes;
}

describe('parseVrmMeta', () => {
  it('reads a VRM 0.x model', () => {
    const meta = parseVrmMeta(glb({
      extensions: {
        VRM: {
          meta: {
            title: 'Kitsaki', author: 'Kaiyo Katsume', allowedUserName: 'Everyone',
            commercialUssageName: 'Disallow',
          },
        },
      },
    }));
    expect(meta.spec).toBe('0.x');
    expect(meta.name).toBe('Kitsaki');
    expect(meta.author).toBe('Kaiyo Katsume');
    expect(meta.commercial).toBe(false);
    expect(meta.authorOnly).toBe(false);
  });

  it('reads a VRM 1.0 model, whose meta is shaped differently', () => {
    // The version split is the whole reason this parser exists rather than one
    // property read: 1.0 renamed every field and made authors an array.
    const meta = parseVrmMeta(glb({
      extensions: {
        VRMC_vrm: {
          specVersion: '1.0',
          meta: {
            name: 'Someone', authors: ['A', 'B'], avatarPermission: 'everyone',
            commercialUsage: 'corporation',
          },
        },
      },
    }));
    expect(meta.spec).toBe('1.0');
    expect(meta.name).toBe('Someone');
    expect(meta.author).toBe('A, B');
    expect(meta.commercial).toBe(true);
  });

  it('flags a model only its own author may use', () => {
    // The one field here with consequences. It has to survive both spellings.
    const v0 = parseVrmMeta(glb({
      extensions: { VRM: { meta: { allowedUserName: 'OnlyAuthor' } } },
    }));
    const v1 = parseVrmMeta(glb({
      extensions: { VRMC_vrm: { meta: { avatarPermission: 'onlyAuthor' } } },
    }));
    expect(v0.authorOnly).toBe(true);
    expect(v1.authorOnly).toBe(true);
  });

  it('survives a file with no VRM extension at all', () => {
    const meta = parseVrmMeta(glb({ asset: { version: '2.0' } }));
    expect(meta.spec).toBe(null);
    expect(meta.name).toBe('');
  });

  it('returns nulls rather than throwing on bytes that are not a GLB', () => {
    // The route reads whatever is in public/. A truncated or renamed file must
    // drop out of the listing, not take the endpoint down with it.
    expect(parseVrmMeta(new Uint8Array([1, 2, 3])).spec).toBe(null);
    expect(parseVrmMeta(new Uint8Array(0)).spec).toBe(null);
  });
});

describe('modelLabel', () => {
  it('prefers the name the model declares', () => {
    expect(modelLabel('untitled-4.vrm', { name: 'Kitsaki' })).toBe('Kitsaki');
  });

  it('falls back to the filename when the model declares nothing', () => {
    // Four of these models carry no title at all, so the fallback is the normal
    // case here rather than the edge case.
    expect(modelLabel('untitled-4.vrm', { name: '' })).toBe('untitled-4');
    expect(modelLabel('haishin-chan.vrm', {})).toBe('haishin-chan');
  });
});
