/**
 * Generates apps/web/public/favicon.png by capturing the real GPU render from useFaviconGlyph().
 *
 * Strategy:
 *   - Expose a Node.js callback via page.exposeFunction('__faviconReady')
 *   - Patch HTMLLinkElement.href setter in-page to call it the instant a data: URL is set
 *   - No polling, no timeouts on rendering; we receive the URL event-driven
 */

import { writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { createServer } from 'vite';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const webRoot = resolve(root, 'apps/web');
const PORT = 5199;

let server;
let browser;

try {
  process.stdout.write('favicon: starting dev server... ');
  server = await createServer({
    root: webRoot,
    server: { port: PORT, strictPort: true },
    logLevel: 'silent',
  });
  await server.listen();
  process.stdout.write('ready\n');

  process.stdout.write('favicon: launching browser... ');
  browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--enable-webgl', '--ignore-gpu-blocklist'],
  });
  process.stdout.write('ready\n');

  const page = await browser.newPage();

  // Show browser errors
  page.on('pageerror', (err) => process.stderr.write(`[browser error] ${err.message}\n`));
  page.on('console', (msg) => {
    const t = msg.type();
    if (t === 'error' || t === 'warn') process.stderr.write(`[${t}] ${msg.text()}\n`);
  });

  // Promise that resolves when useFaviconGlyph sets link[rel="icon"].href = data:...
  let resolveFavicon;
  let rejectTimer;
  const faviconPromise = new Promise((res, rej) => {
    rejectTimer = setTimeout(() => rej(new Error('useFaviconGlyph did not fire within 30s')), 30_000);
    rejectTimer.unref(); // don't block the event loop if everything else finishes
    resolveFavicon = (url) => {
      clearTimeout(rejectTimer);
      res(url);
    };
  });

  // Expose a Node.js function the page can call
  await page.exposeFunction('__faviconReady', (url) => resolveFavicon(url));

  // Intercept the href setter on link[rel="icon"] only, preserving the original getter
  await page.evaluateOnNewDocument(() => {
    const origDescriptor = Object.getOwnPropertyDescriptor(HTMLLinkElement.prototype, 'href');
    const origGet = origDescriptor?.get;
    const origSet = origDescriptor?.set;
    if (!origSet) return;

    Object.defineProperty(HTMLLinkElement.prototype, 'href', {
      get() {
        return origGet ? origGet.call(this) : (this.getAttribute('href') ?? '');
      },
      set(value) {
        origSet.call(this, value);
        if (typeof value === 'string' && value.startsWith('data:') && this.rel === 'icon') {
          const resolved = origGet ? origGet.call(this) : value;
          window.__faviconReady?.(resolved);
        }
      },
      configurable: true,
    });
  });

  process.stdout.write('favicon: loading app... ');
  await page.goto(`http://localhost:${PORT}`, { waitUntil: 'networkidle2', timeout: 30_000 });
  process.stdout.write('loaded\n');

  process.stdout.write('favicon: waiting for GPU render... ');
  const dataURL = await faviconPromise;
  process.stdout.write('done\n');

  const base64 = dataURL.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64, 'base64');
  const out = resolve(webRoot, 'public/favicon.png');
  writeFileSync(out, buffer);
  console.log(`favicon → apps/web/public/favicon.png`);
} catch (err) {
  // In CI environments (e.g. Vercel) Chrome system dependencies may be absent.
  // Favicon generation is optional in restricted environments. A deliberate
  // static favicon replacement should be committed before production release.
  console.warn('\nfavicon: skipping generation —', err.message);
  console.warn('favicon: leaving any existing local apps/web/public/favicon.png untouched.');
} finally {
  await browser?.close();
  await server?.close();
}
