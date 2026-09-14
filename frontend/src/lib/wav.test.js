import { describe, it, expect } from 'vitest';
import { parseWav } from '@/lib/wav.js';

/**
 * Build a WAV in memory.
 *
 * `extraChunks` is the interesting parameter: real encoders interleave LIST,
 * fact and other chunks between fmt and data, and a parser that assumes data
 * begins at byte 44 reads their contents as audio.
 */
function makeWav({ sampleRate = 22050, channels = 1, bits = 16, frames = 22050, extraChunks = [] } = {}) {
  const bytesPerFrame = channels * (bits / 8);
  const dataBytes = frames * bytesPerFrame;
  const extraSize = extraChunks.reduce((sum, c) => sum + 8 + c.size + (c.size % 2), 0);
  const total = 12 + 24 + extraSize + 8 + dataBytes;

  const bytes = new Uint8Array(total);
  const view = new DataView(bytes.buffer);
  const ascii = (offset, text) => {
    for (let i = 0; i < text.length; i += 1) bytes[offset + i] = text.charCodeAt(i);
  };

  ascii(0, 'RIFF');
  view.setUint32(4, total - 8, true);
  ascii(8, 'WAVE');

  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);                                  // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true);
  view.setUint16(34, bits, true);

  let offset = 36;
  for (const chunk of extraChunks) {
    ascii(offset, chunk.id);
    view.setUint32(offset + 4, chunk.size, true);
    offset += 8 + chunk.size + (chunk.size % 2);
  }

  ascii(offset, 'data');
  view.setUint32(offset + 4, dataBytes, true);

  return bytes;
}

describe('parseWav', () => {
  it('rejects anything that is not a WAV', () => {
    expect(parseWav(null)).toBeNull();
    expect(parseWav(new Uint8Array(0))).toBeNull();
    expect(parseWav(new Uint8Array(64))).toBeNull();
    expect(parseWav(new TextEncoder().encode('glTF not a wav at all here'))).toBeNull();
  });

  it('reads the format of a plain mono 16-bit file', () => {
    const header = parseWav(makeWav());
    expect(header.sampleRate).toBe(22050);
    expect(header.channels).toBe(1);
    expect(header.bitsPerSample).toBe(16);
  });

  // The number the whole alignment rests on. If this is wrong the mouth runs
  // fast or slow against the voice for the entire utterance.
  it('computes duration from the data chunk', () => {
    expect(parseWav(makeWav({ frames: 22050 })).durationMs).toBeCloseTo(1000, 6);
    expect(parseWav(makeWav({ frames: 11025 })).durationMs).toBeCloseTo(500, 6);
  });

  it('accounts for channels and bit depth rather than assuming mono 16-bit', () => {
    const stereo = parseWav(makeWav({ channels: 2, frames: 22050 }));
    expect(stereo.durationMs).toBeCloseTo(1000, 6);

    const eightBit = parseWav(makeWav({ bits: 8, frames: 22050 }));
    expect(eightBit.durationMs).toBeCloseTo(1000, 6);
  });

  it('is not fooled by chunks sitting between fmt and data', () => {
    const withList = makeWav({ frames: 22050, extraChunks: [{ id: 'LIST', size: 26 }] });
    expect(parseWav(withList).durationMs).toBeCloseTo(1000, 6);
  });

  it('handles an odd-sized chunk, which is padded to an even length', () => {
    const padded = makeWav({ frames: 22050, extraChunks: [{ id: 'fact', size: 5 }] });
    expect(parseWav(padded).durationMs).toBeCloseTo(1000, 6);
  });

  // A truncated download should report the audio it has, not the audio the
  // header intended — the mouth is laid out against whatever actually plays.
  it('trusts the bytes present over a declared size that overruns them', () => {
    const full = makeWav({ frames: 22050 });
    const cut = full.slice(0, full.length - 22050);        // lose half the samples
    expect(parseWav(cut).durationMs).toBeCloseTo(500, 1);
  });

  it('returns null when the data chunk never arrives', () => {
    const full = makeWav({ frames: 100 });
    expect(parseWav(full.slice(0, 30))).toBeNull();
  });
});
