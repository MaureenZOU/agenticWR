import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {siteRoot, rootFiles, relocatedFiles, readPublicFile} from './site-files.mjs';

// Check the exact JavaScript served to browsers, after Pages removes front matter.
const browserFiles = (await readdir(resolve(siteRoot, 'assets'))).filter(name => name.endsWith('.js')).map(name => `assets/${name}`);
const toolingFiles = ['server.mjs', 'site-files.mjs', 'check-site.mjs', 'check-published.mjs'].map(name => `assets/_dev/${name}`);
let checked = 0;
for (const name of ['app.js', ...browserFiles, ...toolingFiles]) {
  const body = name === 'app.js' ? await readPublicFile(name) : await readFile(resolve(siteRoot, name));
  const result = spawnSync(process.execPath, ['--input-type=module', '--check'], {input:body, encoding:'utf8'});
  assert.equal(result.status, 0, `${name}\n${result.stderr}`);
  checked++;
}
for (const name of rootFiles) assert((await readPublicFile(name)).length > 0, name);
assert.equal(Object.keys(relocatedFiles).length, 8);
const {stdout, status} = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {cwd:siteRoot, encoding:'utf8'});
assert.equal(status, 0);
const entries = [...new Set(stdout.trim().split('\n').map(name => name.split('/')[0]))].sort();
assert.deepEqual(entries, ['.gitignore', 'README.md', 'assets', 'index.html']);
console.log(`PASS: ${checked} JavaScript files, 9 unchanged public root routes, exactly 4 tracked root entries`);
