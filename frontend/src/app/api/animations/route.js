import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The browser cannot list a directory, so the server does it. This keeps adding
// an animation to a file-drop rather than a code edit.
export async function GET() {
  try {
    const dir = join(process.cwd(), 'public', 'animations');
    const entries = await readdir(dir);
    const files = entries.filter((f) => f.toLowerCase().endsWith('.vrma'));
    return Response.json({ files });
  } catch {
    // Directory absent is the normal empty case, not an error.
    return Response.json({ files: [] });
  }
}
