import { readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVrmMeta, modelLabel } from '@/lib/vrmMeta.js';

// Enough for the header plus the glTF JSON chunk of every VRM tried so far.
// Reading the whole file would mean pulling ~180MB off disk to render a list.
const HEAD_BYTES = 1 << 20;

/**
 * Lists the .vrm files in public/ with the name, author and licence each one
 * declares about itself.
 *
 * Same reasoning as /api/animations: the browser cannot read a directory, so
 * adding a model stays a file-drop rather than a code edit. The difference is
 * that this one also opens each file — but only its first megabyte, because
 * that is where the metadata is.
 */
export async function GET() {
  let entries;
  try {
    entries = await readdir(join(process.cwd(), 'public'));
  } catch {
    return Response.json({ models: [] });
  }

  const files = entries.filter((f) => f.toLowerCase().endsWith('.vrm')).sort();

  const models = await Promise.all(files.map(async (file) => {
    const url = `/${file}`;
    let meta = null;
    try {
      const handle = await open(join(process.cwd(), 'public', file), 'r');
      try {
        const buffer = Buffer.alloc(HEAD_BYTES);
        const { bytesRead } = await handle.read(buffer, 0, HEAD_BYTES, 0);
        meta = parseVrmMeta(new Uint8Array(buffer.buffer, 0, bytesRead));
      } finally {
        await handle.close();
      }
    } catch {
      // An unreadable file still belongs in the list under its filename —
      // dropping it silently would look like the file is missing.
      meta = null;
    }
    return { file, url, label: modelLabel(file, meta), ...(meta ?? {}) };
  }));

  return Response.json({ models });
}
