import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
  '.artifact': 'application/json',
};

export async function serveEmbed(directory, port = 0) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
      if (!path.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end();
        return;
      }
      const bytes = await readFile(path);
      response.writeHead(200, {
        'Content-Type': types[extname(path)] ?? 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(bytes);
    } catch {
      response.writeHead(404).end('Not found');
    }
  });
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', accept);
  });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/runtime-embed-server.mjs <dist directory> [port]');
  const { url } = await serveEmbed(process.argv[2], Number(process.argv[3] ?? 4184));
  console.log(`Viber embed: ${url}`);
}
