import type { Config } from '@react-router/dev/config';

export default {
  // Start with SPA mode — PixiJS WebGL is client-only.
  // Flip to true and add a Node adapter when the landing page needs SSR.
  ssr: false,
} satisfies Config;
