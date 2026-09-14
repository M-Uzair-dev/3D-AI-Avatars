import { describe, it, expect } from 'vitest';
import {
  MAX_RESIDENT, ringIndex, ringOrder, stepUrl, neighbours, residentUrls, evictions,
} from '@/lib/carousel.js';

const RING = ['/a.vrm', '/b.vrm', '/c.vrm', '/d.vrm'];

describe('ringIndex', () => {
  it('finds a model in the ring', () => {
    expect(ringIndex(RING, '/c.vrm')).toBe(2);
  });

  it('reports a model that is not in the ring', () => {
    expect(ringIndex(RING, '/nope.vrm')).toBe(-1);
  });
});

describe('stepUrl', () => {
  it('steps forward and back', () => {
    expect(stepUrl(RING, '/b.vrm', +1)).toBe('/c.vrm');
    expect(stepUrl(RING, '/b.vrm', -1)).toBe('/a.vrm');
  });

  // THE BUG THIS GUARDS. JavaScript's % keeps the sign of the dividend, so
  // stepping back from index 0 gives -1, and urls[-1] is undefined rather than
  // an error — a dead button with no symptom but "nothing happened".
  it('wraps backwards off the front', () => {
    expect(stepUrl(RING, '/a.vrm', -1)).toBe('/d.vrm');
  });

  it('wraps forwards off the end', () => {
    expect(stepUrl(RING, '/d.vrm', +1)).toBe('/a.vrm');
  });

  // A carousel that stops at the ends has two controls that do nothing at the
  // two moments you are most likely to press them.
  it('never has a dead end', () => {
    for (const url of RING) {
      expect(stepUrl(RING, url, +1)).toBeTruthy();
      expect(stepUrl(RING, url, -1)).toBeTruthy();
    }
  });

  it('has nowhere to go with fewer than two models', () => {
    expect(stepUrl([], '/a.vrm', +1)).toBeNull();
    expect(stepUrl(['/a.vrm'], '/a.vrm', +1)).toBeNull();
  });

  // The store's url is set from constants and the ring from /api/models. If a
  // file is renamed, those disagree, and the buttons must be inert rather than
  // jumping to an arbitrary model.
  it('has nowhere to go from a model the ring does not contain', () => {
    expect(stepUrl(RING, '/ghost.vrm', +1)).toBeNull();
  });
});

describe('neighbours', () => {
  it('gives both sides', () => {
    expect(neighbours(RING, '/b.vrm')).toEqual({ prev: '/a.vrm', next: '/c.vrm' });
  });

  it('collapses to one model on a ring of two', () => {
    const two = ['/a.vrm', '/b.vrm'];
    expect(neighbours(two, '/a.vrm')).toEqual({ prev: '/b.vrm', next: '/b.vrm' });
  });
});

describe('ringOrder', () => {
  it('starts where she is standing', () => {
    expect(ringOrder(RING, '/b.vrm')[0]).toBe('/b.vrm');
  });

  // Nearest first, alternating outwards. This order is doing two jobs — the
  // order to warm the cache in, and the order to shed it in if a cap is ever
  // reintroduced — so it is worth pinning exactly rather than as a set.
  it('alternates outwards, nearest first', () => {
    expect(ringOrder(RING, '/b.vrm')).toEqual(['/b.vrm', '/c.vrm', '/a.vrm', '/d.vrm']);
  });

  it('wraps rather than stopping at the ends', () => {
    expect(ringOrder(RING, '/a.vrm')).toEqual(['/a.vrm', '/b.vrm', '/d.vrm', '/c.vrm']);
  });

  it('lists every model exactly once', () => {
    const order = ringOrder(RING, '/c.vrm');
    expect(new Set(order).size).toBe(RING.length);
    expect(order).toHaveLength(RING.length);
  });

  it('handles a ring of one without looping forever', () => {
    expect(ringOrder(['/a.vrm'], '/a.vrm')).toEqual(['/a.vrm']);
  });

  it('still names the model on stage when the ring is unknown', () => {
    expect(ringOrder([], '/a.vrm')).toEqual(['/a.vrm']);
    expect(ringOrder(RING, '/ghost.vrm')).toEqual(['/ghost.vrm']);
  });

  it('is empty only when there is nothing at all', () => {
    expect(ringOrder([], null)).toEqual([]);
  });
});

describe('residentUrls', () => {
  // THE POLICY. It was three — on stage plus both neighbours — and three is
  // also the most that guarantees a stall, because two steps in one direction
  // lands on a model nobody fetched. Keeping the whole cast is what makes a
  // transition never wait.
  it('keeps the whole cast', () => {
    expect(residentUrls(RING, '/b.vrm')).toEqual(['/b.vrm', '/c.vrm', '/a.vrm', '/d.vrm']);
  });

  it('is unbounded by default', () => {
    expect(MAX_RESIDENT).toBe(Infinity);
    const big = Array.from({ length: 20 }, (_, i) => `/m${i}.vrm`);
    expect(residentUrls(big, '/m7.vrm')).toHaveLength(20);
  });

  // The cap still works, so lowering it if memory becomes the problem is one
  // line rather than a redesign — and it sheds the models furthest around the
  // ring, which is what keeps both buttons instant at any cap of 3 or more.
  it('honours a cap, shedding the furthest away', () => {
    expect(residentUrls(RING, '/b.vrm', 3)).toEqual(['/b.vrm', '/c.vrm', '/a.vrm']);
    expect(residentUrls(RING, '/b.vrm', 1)).toEqual(['/b.vrm']);
  });

  it('does not list the same model twice on a short ring', () => {
    expect(residentUrls(['/a.vrm', '/b.vrm'], '/a.vrm')).toEqual(['/a.vrm', '/b.vrm']);
  });

  it('still wants the model on stage when the ring is unknown', () => {
    expect(residentUrls([], '/a.vrm')).toEqual(['/a.vrm']);
  });
});

describe('evictions', () => {
  const cached = [
    { url: '/a.vrm', lastUsed: 300 },
    { url: '/b.vrm', lastUsed: 100 },
    { url: '/c.vrm', lastUsed: 200 },
  ];

  it('keeps what it is told to keep', () => {
    expect(evictions(cached, ['/a.vrm', '/c.vrm'])).toEqual(['/b.vrm']);
  });

  it('evicts coldest first', () => {
    expect(evictions(cached, [])).toEqual(['/b.vrm', '/c.vrm', '/a.vrm']);
  });

  // A prefetched model that was never shown has no lastUsed. It is the coldest
  // thing in the cache, not the warmest — the opposite reading would evict the
  // model actually on stage in favour of one nobody has seen.
  it('treats a never-shown prefetch as coldest', () => {
    const withPrefetch = [{ url: '/a.vrm', lastUsed: 100 }, { url: '/z.vrm' }];
    expect(evictions(withPrefetch, [])).toEqual(['/z.vrm', '/a.vrm']);
  });

  it('evicts nothing when everything is wanted', () => {
    expect(evictions(cached, ['/a.vrm', '/b.vrm', '/c.vrm'])).toEqual([]);
  });

  // This function replaced an unconditional deepDispose on every model change.
  // Returning nothing when nothing is wanted would leak the entire cache
  // silently and forever, which is exactly the failure that has no symptom.
  it('does not quietly refuse to evict', () => {
    expect(evictions(cached, []).length).toBe(cached.length);
  });

  it('does not mutate what it is given', () => {
    const input = cached.map((e) => ({ ...e }));
    evictions(input, []);
    expect(input.map((e) => e.url)).toEqual(['/a.vrm', '/b.vrm', '/c.vrm']);
  });
});
