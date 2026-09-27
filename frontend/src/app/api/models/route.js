import { readdir, open } from 'node:fs/promises';
import { join } from 'node:path';
import { parseVrmMeta, modelLabel } from '@/lib/vrmMeta.js';

/**
 * PRERENDERED AT BUILD TIME, and this is load-bearing rather than tidy.
 *
 * Two things were wrong with running this per request. The small one: it opens
 * every .vrm in public/ and reads a megabyte off each, so rendering a list of
 * eight models was eight megabytes of disk read on every cold page load.
 *
 * The large one: on Vercel, public/ is uploaded as CDN assets, and a serverless
 * function's filesystem is built from the build's output trace — which has no
 * reason to include files only the CDN serves. A `readdir` here can come back
 * empty in production while being perfectly correct in dev, and the failure is
 * silent and off to one side: the first model still loads, because MODEL_URL is
 * a constant, and it is the CAROUSEL that quietly has nothing to walk to. That
 * reads as a UI bug, and it is a deployment one.
 *
 * `force-static` moves the directory read to build time, where public/ is
 * unambiguously present, and serves the answer as a static file afterwards. It
 * costs the file-drop nothing: `next dev` runs route handlers on every request,
 * so dropping a model in still shows up on reload, and a deploy rebuilds.
 */
export const dynamic = 'force-static';

// Enough for the header plus the glTF JSON chunk of every VRM tried so far.
// Reading the whole file would mean pulling the entire cast off disk — ~28MB
// now, and ~150MB before the models were optimised — to render a list.
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
