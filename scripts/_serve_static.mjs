import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
const ROOT = 'C:/Users/Administrator/novachain-web';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png' };
const server = createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/sdk/demo.html';
  const f = join(ROOT, p);
  try {
    const d = readFileSync(f);
    res.writeHead(200, { 'Content-Type': MIME[p.slice(p.lastIndexOf('.'))] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(d);
  } catch (e) { res.writeHead(404); res.end('not found'); }
});
server.listen(8767, '127.0.0.1', () => console.log('serve 8767'));
