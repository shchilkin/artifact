import type { MetaFunction } from 'react-router';
import { PublicPageLayout } from '../components/PublicPageLayout';
import { RouteRecovery } from '../components/product-surfaces/RouteRecovery';

export const meta: MetaFunction = () => [{ title: 'artifact | Page not found' }];

// Unknown paths render inside Root instead of replacing it through the root
// ErrorBoundary. The SPA shell is rendered with Root, so this keeps hydration
// of a direct visit to an unknown URL consistent with the shell HTML.
export default function NotFoundRoute() {
  return (
    <PublicPageLayout className="product-route-layout">
      <main className="product-route-main">
        <RouteRecovery
          eyebrow="404 / Not found"
          title="Page not found."
          detail="The requested page could not be found."
        />
      </main>
    </PublicPageLayout>
  );
}
