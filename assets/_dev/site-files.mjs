import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';

export const siteRoot = fileURLToPath(new URL('../../', import.meta.url));
export const rootFiles = ['index.html', 'method.html', 'results.html', 'action.html', 'representation.html', 'real-robot.html', 'zoo.html', 'app.js', 'styles.css'];
export const relocatedFiles = Object.fromEntries(rootFiles.filter(name => name !== 'index.html').map(name => [name, `assets/${name.endsWith('.html') ? 'pages' : 'entry'}/${name}`]));

export function unwrapPage(bytes, publicPath) {
  const header = Buffer.from(`---\nlayout: null\npermalink: /${publicPath}\n---\n`);
  if (!bytes.subarray(0, header.length).equals(header)) throw new Error(`Invalid publishing header: ${publicPath}`);
  return bytes.subarray(header.length);
}

export async function readPublicFile(publicPath, directory = siteRoot) {
  const sourceLayout = resolve(directory) === resolve(siteRoot);
  const allowed = rootFiles.includes(publicPath) || publicPath.startsWith('assets/');
  if (!allowed || publicPath.split('/').some(part => !part || part.startsWith('.') || part.startsWith('_'))) throw new Error('Not a public file');
  if (sourceLayout && /^(assets\/pages\/|assets\/entry\/)/.test(publicPath)) throw new Error('Source-only page');
  const source = sourceLayout ? (relocatedFiles[publicPath] || publicPath) : publicPath;
  const file = resolve(directory, source);
  if (!file.startsWith(resolve(directory) + sep)) throw new Error('Path outside site');
  const bytes = await readFile(file);
  return sourceLayout && relocatedFiles[publicPath] ? unwrapPage(bytes, publicPath) : bytes;
}
