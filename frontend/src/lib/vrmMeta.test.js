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

describe('redistribution', () => {
  const VROID = (redistribution) => glb({
    extensions: {
      VRM: {
        meta: {
          title: 'FREE 2', author: 'AnimeFreak', allowedUserName: 'Everyone',
          commercialUssageName: 'Allow', licenseName: 'Other',
          otherLicenseUrl: 'https://hub.vroid.com/license?allowed_to_use_user=everyone'
            + `&corporate_commercial_use=allow&modification=allow&redistribution=${redistribution}`
            + '&credit=unnecessary&version=1',
        },
      },
    },
  });

  // The case this whole field exists for. Every model in public/ is shaped like
  // this: 0.x, licenseName 'Other', and the only statement about redistribution
  // is a query parameter on a URL that looks like a link and is really terms.
  it('reads the flag out of a VRoid Hub licence URL', () => {
    expect(parseVrmMeta(VROID('allow')).redistribution).toBe(true);
    expect(parseVrmMeta(VROID('disallow')).redistribution).toBe(false);
  });

  // The mistake this replaces. Both flags live in the same URL and three of the
  // eight models in this project set them opposite ways, so reading one and
  // assuming the other is not a shortcut — it is the wrong answer.
  it('does not infer redistribution from commercial use', () => {
    const meta = parseVrmMeta(VROID('disallow'));
    expect(meta.commercial).toBe(true);
    expect(meta.redistribution).toBe(false);
  });

  it('reads the 1.0 boolean, which needs no URL', () => {
    const meta = parseVrmMeta(glb({
      extensions: {
        VRMC_vrm: {
          meta: {
            name: 'One', authors: ['A'], avatarPermission: 'everyone',
            commercialUsage: 'corporation', allowRedistribution: false,
          },
        },
      },
    }));
    expect(meta.spec).toBe('1.0');
    expect(meta.redistribution).toBe(false);
  });

  it('reads the 0.x enumerated prohibition without a URL', () => {
    const meta = parseVrmMeta(glb({
      extensions: {
        VRM: { meta: { title: 'X', licenseName: 'Redistribution_Prohibited' } },
      },
    }));
    expect(meta.redistribution).toBe(false);
  });

  // Null, not false. A caller must still refuse to redistribute — but "the file
  // does not say, go and read the source page" and "the file says no" are
  // different things to put in front of someone deciding.
  it('is null when the file says nothing about it', () => {
    const meta = parseVrmMeta(glb({
      extensions: { VRM: { meta: { title: 'X', commercialUssageName: 'Allow' } } },
    }));
    expect(meta.redistribution).toBeNull();
  });

  it('is null, and does not throw, on a licence URL that is only URL-shaped', () => {
    const meta = parseVrmMeta(glb({
      extensions: {
        VRM: { meta: { title: 'X', licenseName: 'Other', otherLicenseUrl: 'not a url at all' } },
      },
    }));
    expect(meta.redistribution).toBeNull();
    expect(meta.licenceUrl).toBe('not a url at all');
  });

  it('surfaces the licence URL, since it is the terms rather than a link to them', () => {
    expect(parseVrmMeta(VROID('allow')).licenceUrl).toContain('redistribution=allow');
  });

  it('is null on bytes that are not a model', () => {
    expect(parseVrmMeta(new Uint8Array([1, 2, 3])).redistribution).toBeNull();
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
