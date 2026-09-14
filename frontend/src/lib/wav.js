/**
 * Read the header of a RIFF/WAVE buffer.
 *
 * Why this exists: the mouth has to be laid out across the *real* length of the
 * audio, and the only authority on that is the audio itself. Computing it from
 * the text, or from the phoneme count, or from a rate multiplier is exactly the
 * kind of derived number this project has been wrong about repeatedly — and the
 * symptom here would be a mouth that finishes before or after the voice does.
 *
 * The browser could also tell us, via decodeAudioData, but only after decoding.
 * Reading the header lets the server report the duration alongside the bytes,
 * so a failed or truncated synthesis is caught before it reaches the timeline.
 *
 * Same shape of job as vrmMeta.js, which parses a VRM header out of raw bytes
 * for the model picker — and the same reason for being pure: header parsing is
 * fiddly, and fiddly code you can test in Node is code you can trust.
 *
 * Pure — no React, no three.js, no Node APIs. Operates on a Uint8Array.
 */

/** Four ASCII bytes at `offset`, as a string. */
function tag(bytes, offset) {
  return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
}

/**
 * Parse the fmt and data chunks of a WAV buffer.
 *
 * Chunks are walked rather than assumed at fixed offsets: a WAV written by one
 * tool may carry LIST/INFO or fact chunks ahead of the data that another never
 * emits, and a parser that assumes data starts at byte 44 reads garbage the
 * first time it meets one.
 *
 * @param {Uint8Array} bytes
 * @returns {{sampleRate: number, channels: number, bitsPerSample: number,
 *            dataBytes: number, durationMs: number} | null}
 *          null if this is not a WAV, or is truncated before the data chunk.
 */
export function parseWav(bytes) {
  if (!bytes || bytes.length < 12) return null;
  if (tag(bytes, 0) !== 'RIFF' || tag(bytes, 8) !== 'WAVE') return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataBytes = 0;

  // Chunks run [4-byte id][4-byte size][payload], each padded to an even length.
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const id = tag(bytes, offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;

    if (id === 'fmt ' && body + 16 <= bytes.length) {
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bitsPerSample = view.getUint16(body + 14, true);
    } else if (id === 'data') {
      // Trust the smaller of the declared size and what actually arrived, so a
      // truncated download reports the duration it really has rather than the
      // one it meant to have.
      dataBytes = Math.min(size, Math.max(0, bytes.length - body));
      break;
    }

    offset = body + size + (size % 2);
  }

  if (sampleRate <= 0 || channels <= 0 || bitsPerSample <= 0 || dataBytes <= 0) return null;

  const bytesPerFrame = channels * (bitsPerSample / 8);
  const durationMs = (dataBytes / bytesPerFrame / sampleRate) * 1000;

  return { sampleRate, channels, bitsPerSample, dataBytes, durationMs };
}
