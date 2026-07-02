import { useEffect } from 'react';
import type { MetaFunction } from 'react-router';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './index.css';
import { ArtifactAuthProvider } from './components/ArtifactAuthProvider';
import { ARTIFACT_THEME_STORAGE_KEY, useArtifactTheme } from './hooks/useArtifactTheme';
import { GOOGLE_FONT_STYLESHEET_URL } from './types/config';
import { logAppBuildInfo } from './utils/appBuildInfo';
import { registerArtifactServiceWorker } from './utils/pwaRegistration';

// Default title/description — route-level meta() overrides these via <Meta />
export const meta: MetaFunction = () => [
  { title: 'artifact | Create Album Covers' },
  {
    name: 'description',
    content: 'Design editable, GPU-rendered album covers with photos, type, texture, effects, layers, and nodes.',
  },
];

const themeBootScript = `(() => {
  let stored = null;
  try {
    stored = window.localStorage.getItem('${ARTIFACT_THEME_STORAGE_KEY}');
  } catch {
    stored = null;
  }
  const preference = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
  const resolved = preference === 'system'
    ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : preference;
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = resolved;
})();`;

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" data-theme-preference="system" suppressHydrationWarning>
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ff6a5f" />
        <meta name="color-scheme" content="dark light" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Artifact" />
        {/* OG */}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en" />
        <meta property="og:url" content="https://artifact.shchilkin.dev" />
        <meta property="og:title" content="artifact | Create Album Covers" />
        <meta
          property="og:description"
          content="Design editable, GPU-rendered album covers with photos, type, texture, effects, layers, and nodes."
        />
        <meta property="og:image" content="https://artifact.shchilkin.dev/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="artifact: editable album cover workspace" />
        <meta property="og:logo" content="https://artifact.shchilkin.dev/favicon.svg" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="artifact | Create Album Covers" />
        <meta
          name="twitter:description"
          content="Design editable, GPU-rendered album covers with photos, type, texture, effects, layers, and nodes."
        />
        <meta name="twitter:image" content="https://artifact.shchilkin.dev/og.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONT_STYLESHEET_URL} rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
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
  useArtifactTheme();

  useEffect(() => {
    logAppBuildInfo();
    void registerArtifactServiceWorker({ enabled: !import.meta.env.DEV }).catch((error) => {
      console.warn('[pwa] service worker registration failed', error);
    });
  }, []);

  return (
    <ArtifactAuthProvider>
      <Outlet />
    </ArtifactAuthProvider>
  );
}

function routeErrorBoundaryView(error: unknown) {
  const routeError = error as { status: number; statusText?: string };
  return {
    message: routeError.status === 404 ? '404' : 'Error',
    details:
      routeError.status === 404
        ? 'The requested page could not be found.'
        : routeError.statusText || 'An unexpected error occurred.',
    stack: undefined,
  };
}

function devErrorBoundaryView(error: Error) {
  return { message: 'Oops!', details: error.message, stack: error.stack };
}

function defaultErrorBoundaryView() {
  return { message: 'Oops!', details: 'An unexpected error occurred.', stack: undefined };
}

function getErrorBoundaryView(error: Route.ErrorBoundaryProps['error']) {
  if (isRouteErrorResponse(error)) {
    return routeErrorBoundaryView(error);
  }
  if (import.meta.env.DEV && error instanceof Error) return devErrorBoundaryView(error);
  return defaultErrorBoundaryView();
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { message, details, stack } = getErrorBoundaryView(error);

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
