import './styles/dev.runtime.css';
import type { MetaFunction } from 'react-router';
import { RuntimeCatalogue } from '../components/runtime-catalogue/RuntimeCatalogue';

export const meta: MetaFunction = () => [
  { title: 'artifact | Runtime catalogue' },
  { name: 'robots', content: 'noindex' },
];

/** Development-only catalogue of the experimental runtime's effects (registered outside production builds). */
export default function DevRuntimeRoute() {
  return (
    <main className="runtime-catalogue-page">
      <RuntimeCatalogue />
    </main>
  );
}
