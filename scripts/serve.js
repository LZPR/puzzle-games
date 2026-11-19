import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || '127.0.0.1';
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const target = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!target.startsWith(resolve(root) + sep) || pathname.split(/[\\/]/).some(part => part.startsWith('.')) || !types[extname(target)]) {
      response.writeHead(404).end();
      return;
    }
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[extname(target)] + '; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(404).end();
  }
}).listen(port, host, () => console.log(`Puzzle Arcade · http://${host}:${port}`));
