// Serves the built game (dist/) for the production browser tests, the way GitHub Pages does:
// once at the root and once under /v2/. `POST /__bump` makes sw.js differ by one comment, which is
// how the update test pretends a new build was deployed. Usage: tsx tools/serve-dist.ts <port>
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2] ?? 4205);
const root = resolve('dist');
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
let bump = 0;

createServer((req, res) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'POST' && url.pathname === '/__bump') {
      bump += 1;
      res.writeHead(204).end();
      return;
    }
    let path = url.pathname.replace(/^\/v2(?=\/|$)/, '');
    if (path === '' || path.endsWith('/')) path += 'index.html';
    const file = join(root, normalize(path));
    if (!file.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    try {
      let body = await readFile(file);
      if (path === '/sw.js' && bump > 0)
        body = Buffer.concat([body, Buffer.from(`\n// bump ${bump}\n`)]);
      res.writeHead(200, {
        'Content-Type': types[extname(file)] ?? 'application/octet-stream',
        // like Pages: the HTML and the worker are revalidated, hashed assets are not
        'Cache-Control': path.startsWith('/assets/') ? 'max-age=600' : 'no-cache',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('not found');
    }
  })();
}).listen(port, () => console.log(`serving dist/ at http://localhost:${port}/ and /v2/`));
