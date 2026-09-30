import { readFileSync } from 'node:fs';
import type { Config } from '@react-router/dev/config';

interface RouteLoadingContract {
  delivery: { prerender: string[] };
}

// The loading contract owns which static public paths are prerendered; everything else is served by the
// SPA fallback (`__spa-fallback.html`). See docs/loading/route-loading-matrix.md.
const contract = JSON.parse(
  readFileSync(new URL('../../docs/loading/route-loading-contract.json', import.meta.url), 'utf8'),
) as RouteLoadingContract;

export default {
  // No runtime SSR service: PixiJS WebGL, auth, and storage are client-only. Approved static public paths
  // are rendered to HTML at build time and hydrate on the client.
  ssr: false,
  prerender: contract.delivery.prerender,
} satisfies Config;
