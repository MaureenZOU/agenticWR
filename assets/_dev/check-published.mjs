import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
import {siteRoot, rootFiles, readPublicFile} from './site-files.mjs';

// Compare bytes directly: no digests or generated checksum manifests.
const baseline = process.argv[3] || 'd3f33e4';
const destination = process.argv[2];
assert(destination, 'Usage: npm --prefix assets run check:published -- /path/to/built/site [baseline]');
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline], {cwd:siteRoot, encoding:'utf8'}).trim().split('\n')
  .filter(name => rootFiles.includes(name) || name.startsWith('assets/'));
let bytes = 0;
for (const name of paths) {
  const original = execFileSync('git', ['show', `${baseline}:${name}`], {cwd:siteRoot, maxBuffer:128 * 1024 * 1024});
  const built = await readFile(resolve(destination, name));
  assert(built.equals(original), `Published content changed: ${name}`);
  assert((await readPublicFile(name)).equals(built), `Local preview differs from Pages: ${name}`);
  bytes += built.length;
}
console.log(JSON.stringify({baseline, paths:paths.length, bytes, allPublicPathsPreserved:true, allPublicFilesByteIdentical:true, previewMatchesBuild:true}, null, 2));
