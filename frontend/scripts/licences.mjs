/**
 * Print what every model in public/ permits, and check that git agrees.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The models were filtered once to those permitting commercial use, and that
 * was recorded as "the licence filter" and treated as settled. It answered a
 * different question than the one that governs the repository: a VRM's licence
 * carries `commercial_use` and `redistribution` as SEPARATE flags, and three of
 * the eight models here set them opposite ways — usable in the product, not
 * handable on. Committing all eight to a public repo would have redistributed
 * three files whose own metadata forbids it.
 *
 * So the rule is per file and per licence, it lives in .gitignore as an
 * exception list, and an exception list drifts. This is the thing that tells
 * you it has: it reads each model's own metadata, prints what it says, and
 * fails if a file git is tracking does not permit redistribution.
 *
 * Run it before adding a `!` line to .gitignore, and after adding a model.
 *
 *   npm run licences
 *
 * Exit code is 1 if anything is tracked that should not be, so it is usable in
 * CI as it stands.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { parseVrmMeta } from '../src/lib/vrmMeta.js';

const DIR = 'public';
const files = existsSync(DIR)
  ? readdirSync(DIR).filter((f) => f.toLowerCase().endsWith('.vrm')).sort()
  : [];

if (files.length === 0) {
  console.log(`No .vrm files in ${DIR}/.`);
  process.exit(0);
}

/** The .vrm paths git is tracking, relative to frontend/. */
function trackedModels() {
  try {
    return new Set(
      execFileSync('git', ['ls-files', '--', `${DIR}/*.vrm`], { encoding: 'utf8' })
        .split('\n').map((l) => l.trim()).filter(Boolean),
    );
  } catch {
    // Not a git checkout, or no git. The table is still worth printing.
    return null;
  }
}

const tracked = trackedModels();
const rows = [];

for (const file of files) {
  const buf = readFileSync(join(DIR, file));
  const meta = parseVrmMeta(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  rows.push({
    file,
    name: meta.name || '—',
    author: meta.author || '—',
    commercial: meta.commercial,
    // Null means the file is silent, and silence is not permission.
    redistribution: meta.redistribution,
    tracked: tracked ? tracked.has(`${DIR}/${file}`) : null,
    licenceUrl: meta.licenceUrl,
  });
}

const w = (s, n) => String(s).padEnd(n).slice(0, n);
const flag = (v) => (v === true ? 'allow' : v === false ? 'DISALLOW' : 'unstated');

console.log('');
console.log(`${w('file', 20)}${w('character', 16)}${w('commercial', 12)}${w('redistribution', 16)}${w('in git', 8)}`);
console.log('-'.repeat(72));

let problems = 0;
for (const r of rows) {
  const mayCommit = r.redistribution === true;
  const inGit = r.tracked === null ? '?' : r.tracked ? 'yes' : 'no';
  if (r.tracked === true && !mayCommit) problems += 1;

  console.log(
    w(r.file, 20) + w(r.name, 16) + w(flag(r.commercial), 12)
    + w(flag(r.redistribution), 16) + w(inGit, 8),
  );
}

console.log('');
for (const r of rows.filter((x) => x.redistribution !== true)) {
  console.log(`  ${r.file} — not committable: redistribution ${flag(r.redistribution)}`);
  if (r.licenceUrl) console.log(`    ${r.licenceUrl}`);
}

if (problems > 0) {
  console.error(
    `\n${problems} tracked model${problems === 1 ? '' : 's'} do not permit redistribution.`
    + '\nRemove the matching `!` line from .gitignore and `git rm --cached` the file.'
    + '\nNote that git history keeps it: a push has already redistributed it.',
  );
  process.exit(1);
}

console.log('Every tracked model permits redistribution.');
