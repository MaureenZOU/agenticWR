import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 4173);
const host = process.env.PROJECT_HOST || '127.0.0.1';
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.gif':'image/gif', '.webp':'image/webp', '.mp4':'video/mp4', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.json':'application/json', '.txt':'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = resolve(root, relative);
    const allowed = ['index.html','styles.css','app.js'].includes(relative) || relative.startsWith('assets/');
    if (!allowed || !file.startsWith(root + sep) || relative.split('/').some(part=>part.startsWith('.'))) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const info = await stat(file);
    if (!info.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    const content = await readFile(file);
    res.writeHead(200, { 'Content-Type':mime[extname(file)] || 'application/octet-stream', 'Content-Length':content.length, 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
server.on('error', error => { console.error(`Preview server: ${error.message}`); process.exitCode=1; });
server.listen(port, host, () => console.log(`Research project website listening on ${host}:${port}`));
