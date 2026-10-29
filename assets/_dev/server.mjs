import { createServer } from 'node:http';
import { resolve, extname } from 'node:path';
import { siteRoot, readPublicFile } from './site-files.mjs';

const root = process.env.PROJECT_SITE_DIR ? resolve(process.env.PROJECT_SITE_DIR) : siteRoot;
const port = Number(process.env.PORT || 4173);
const host = process.env.PROJECT_HOST || '127.0.0.1';
const basePath = (process.env.PROJECT_BASE_PATH || '').replace(/\/$/, '');
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.gif':'image/gif', '.webp':'image/webp', '.mp4':'video/mp4', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.ttf':'font/ttf', '.json':'application/json', '.txt':'text/plain; charset=utf-8' };
const server = createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); res.end(); return; }
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (basePath && pathname === basePath) { res.writeHead(302, { Location:basePath + '/' }); res.end(); return; }
    if (!pathname.startsWith(basePath + '/')) {
      res.writeHead(404); res.end('Not found'); return;
    }
    const relative = pathname.slice(basePath.length + 1) || 'index.html';
    const content = await readPublicFile(relative, root);
    const headers = { 'Content-Type':mime[extname(relative)] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-cache', 'X-Content-Type-Options':'nosniff' };
    // Native video scrubbing requires byte ranges in the local preview too.
    if (req.headers.range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      let start = match?.[1] ? Number(match[1]) : 0;
      let end = match?.[2] ? Number(match[2]) : content.length - 1;
      if (match && !match[1] && match[2]) { start = Math.max(0, content.length - Number(match[2])); end = content.length - 1; }
      end = Math.min(end, content.length - 1);
      if (!match || (!match[1] && !match[2]) || start > end || start >= content.length) {
        res.writeHead(416, { ...headers, 'Content-Range':`bytes */${content.length}` }); res.end(); return;
      }
      res.writeHead(206, { ...headers, 'Content-Length':end - start + 1, 'Content-Range':`bytes ${start}-${end}/${content.length}` });
      res.end(req.method === 'HEAD' ? undefined : content.subarray(start, end + 1)); return;
    }
    res.writeHead(200, { ...headers, 'Content-Length':content.length });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    res.writeHead(404); res.end('Not found');
  }
});
server.on('error', error => { console.error(`Preview server: ${error.message}`); process.exitCode=1; });
server.listen(port, host, () => console.log(`Research project website listening on http://${host}:${port}${basePath}/`));
