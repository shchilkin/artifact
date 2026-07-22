import type { MetaFunction } from 'react-router';
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import type { Route } from './+types/root';
import { RouteSkeleton, RouteState } from './components/RouteState';
import './styles.css';

export const meta: MetaFunction = () => [
  { title: 'Artifact Backoffice' },
  {
    name: 'description',
    content: 'Account access and provider usage operations for Artifact.',
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="backoffice-product-theme">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="theme-color" content="#100d0c" />
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

export function HydrateFallback() {
  return <RouteSkeleton label="Loading Artifact Backoffice" />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error)) {
    return (
      <RouteState
        kind="error"
        title={error.status === 404 ? 'Page not found' : 'Request failed'}
        message={error.statusText}
      />
    );
  }
  return (
    <RouteState
      kind="error"
      title="Backoffice unavailable"
      message={error instanceof Error ? error.message : 'An unexpected error interrupted the application.'}
    />
  );
}
