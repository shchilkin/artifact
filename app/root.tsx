import { useEffect } from 'react';
import type { MetaFunction } from 'react-router';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './index.css';
import { ALL_EMOJIS } from './types/config';

// Default title/description — route-level meta() overrides these via <Meta />
export const meta: MetaFunction = () => [
  { title: 'artifact | Create Album Covers' },
  {
    name: 'description',
    content: 'Generate glitchy, GPU-rendered album covers with emoji, effects, and one click.',
  },
];

function useFaviconGlyph() {
  useEffect(() => {
    Promise.all([import('pixi.js'), import('./utils/logoVariants')]).then(
      ([{ Renderer, Container }, { RENDER, VARIANTS }]) => {
        const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];
        const variant = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
        let renderer: InstanceType<typeof Renderer>;
        try {
          renderer = new Renderer({
            width: RENDER,
            height: RENDER,
            backgroundAlpha: 0,
            antialias: false,
          });
        } catch {
          return;
        }
        const stage = new Container();
        const cleanup = variant(stage, renderer, emoji, true);
        const canvas = renderer.view as HTMLCanvasElement;
        const url = canvas.toDataURL('image/png');
        const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
        if (link) {
          link.type = 'image/png';
          link.href = url;
        }
        cleanup();
        renderer.destroy(true);
      },
    );
  }, []);
}

export function Layout({ children }: { children: React.ReactNode }) {
  useFaviconGlyph();
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/png" sizes="72x72" href="/favicon.png" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        {/* OG */}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en" />
        <meta property="og:url" content="https://artifact.shchilkin.dev" />
        <meta property="og:title" content="artifact | Create Album Covers" />
        <meta
          property="og:description"
          content="Generate glitchy, GPU-rendered album covers with emoji, effects, and one click."
        />
        <meta property="og:image" content="https://artifact.shchilkin.dev/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="artifact: glitch album cover generator" />
        <meta property="og:logo" content="https://artifact.shchilkin.dev/favicon.png" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="artifact | Create Album Covers" />
        <meta
          name="twitter:description"
          content="Generate glitchy, GPU-rendered album covers with emoji, effects, and one click."
        />
        <meta name="twitter:image" content="https://artifact.shchilkin.dev/og.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@700;900&family=VT323&family=Special+Elite&display=swap"
          rel="stylesheet"
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = 'Oops!';
  let details = 'An unexpected error occurred.';
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? '404' : 'Error';
    details = error.status === 404 ? 'The requested page could not be found.' : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="p-8 container mx-auto">
      <h1 className="text-2xl font-bold mb-2">{message}</h1>
      <p className="text-dim">{details}</p>
      {stack && (
        <pre className="mt-4 w-full p-4 overflow-x-auto text-xs bg-black/10 rounded">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
