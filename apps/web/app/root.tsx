import { lazy, Suspense, useEffect, useSyncExternalStore } from 'react';
import type { MetaFunction } from 'react-router';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import './index.css';
import { ArtifactAuthProvider } from './components/ArtifactAuthProvider';
import { LogoGlyph } from './components/LogoGlyph';
import { RouteRecovery } from './components/product-surfaces/RouteRecovery';
import { GOOGLE_FONT_STYLESHEET_URL } from './types/typography';
import { getAppBuildInfo, logAppBuildInfo } from './utils/appBuildInfo';
import { pageMeta } from './utils/pageMeta';
import { registerArtifactServiceWorker } from './utils/pwaRegistration';

// Public navigation is route-owned; the root loads it only when it has to render a recovery page.
const PublicPageLayout = lazy(() =>
  import('./components/PublicPageLayout').then((module) => ({ default: module.PublicPageLayout })),
);

// Default title/description; a route-level meta() replaces this whole set via <Meta />.
export const meta: MetaFunction = () =>
  pageMeta({
    title: 'artifact | Create Album Covers',
    description: 'Design editable, GPU-rendered album covers with photos, type, texture, effects, layers, and nodes.',
    path: '/',
  });

export function Layout({ children }: { children: React.ReactNode }) {
  const build = getAppBuildInfo();

  return (
    <html lang="en" className="artifact-product-theme">
      <head>
        <meta charSet="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#ff6a5f" />
        <meta name="artifact-build-sha" content={build.commitHash} />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="Artifact" />
        {/* OG */}
        <meta property="og:type" content="website" />
        <meta property="og:locale" content="en" />
        <meta property="og:image" content="https://artifact.shchilkin.dev/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="artifact: editable album cover workspace" />
        <meta property="og:logo" content="https://artifact.shchilkin.dev/favicon.svg" />
        {/* Twitter */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:image" content="https://artifact.shchilkin.dev/og.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={GOOGLE_FONT_STYLESHEET_URL} rel="stylesheet" />
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

// Shown by the SPA fallback document (`__spa-fallback.html`) until the matched route's JavaScript loads.
// Prerendered public pages ship their real content instead.
export function HydrateFallback() {
  return (
    <div className="app-hydrate-fallback" role="status" aria-live="polite">
      <div className="app-hydrate-fallback__brand">
        <LogoGlyph size={40} />
        <span className="app-hydrate-fallback__wordmark">artifact</span>
      </div>
      <p className="app-hydrate-fallback__label">Loading…</p>
      <span className="app-hydrate-fallback__bar" aria-hidden="true" />
    </div>
  );
}

/** Prerendered pages are visible before they are interactive; this marks the document once React owns it. */
function useHydratedDocumentMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = 'true';
  }, []);
}

export default function Root() {
  useHydratedDocumentMarker();
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
    eyebrow: routeError.status === 404 ? '404 / Not found' : `Error / ${routeError.status}`,
    message: routeError.status === 404 ? 'Page not found.' : 'Something went wrong.',
    details:
      routeError.status === 404
        ? 'The requested page could not be found.'
        : routeError.statusText || 'An unexpected error occurred.',
    stack: undefined,
  };
}

function devErrorBoundaryView(error: Error) {
  return { eyebrow: 'Development error', message: 'Something went wrong.', details: error.message, stack: error.stack };
}

function defaultErrorBoundaryView() {
  return {
    eyebrow: 'Unexpected error',
    message: 'Something went wrong.',
    details: 'An unexpected error occurred.',
    stack: undefined,
  };
}

function getErrorBoundaryView(error: Route.ErrorBoundaryProps['error']) {
  if (isRouteErrorResponse(error)) {
    return routeErrorBoundaryView(error);
  }
  if (import.meta.env.DEV && error instanceof Error) return devErrorBoundaryView(error);
  return defaultErrorBoundaryView();
}

const subscribeToNothing = () => () => {};

/** True only while React hydrates server-rendered markup; false for every later client render. */
function useIsHydrating() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => false,
    () => true,
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const { eyebrow, message, details, stack } = getErrorBoundaryView(error);
  // An unknown path is served the SPA fallback document, whose markup is HydrateFallback. Hydrate that same
  // markup first, then replace it with the recovery page, so React never sees a hydration mismatch.
  const isHydrating = useIsHydrating();
  useHydratedDocumentMarker();
  if (isHydrating) return <HydrateFallback />;

  const recovery = (
    <main className="product-route-main">
      <RouteRecovery
        eyebrow={eyebrow}
        title={message}
        detail={details}
        diagnostics={
          stack ? (
            <details>
              <summary>Development details</summary>
              <pre>
                <code>{stack}</code>
              </pre>
            </details>
          ) : null
        }
      />
    </main>
  );

  return (
    <Suspense fallback={recovery}>
      <PublicPageLayout className="product-route-layout">{recovery}</PublicPageLayout>
    </Suspense>
  );
}
