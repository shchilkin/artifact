import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';
import { HeroCover } from '../components/HeroCover';
import { SiteNav } from '../components/SiteNav';

export const meta: MetaFunction = () => [
  { title: 'Album Cover Generator' },
  { name: 'description', content: 'Make strange, deliberate glitch covers in your browser. 16 effects, seeded, no account needed.' },
];

export default function Home() {
  return (
    <div className="landing">
      <SiteNav />
      <div className="landing-grain" aria-hidden="true" />
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-text">
            <h1 className="landing-headline">
              Make something<br />
              <span className="landing-headline__weird">weird.</span>
            </h1>
            <div className="landing-rule" aria-hidden="true" />
            <ul className="landing-features" aria-label="Features">
              <li>16 effects. No two covers alike.</li>
              <li>No account. No install.</li>
            </ul>
            <Link to="/app" className="btn btn-primary landing-cta">
              Open Generator →
            </Link>
          </div>
          <div className="landing-cover-wrap">
            <HeroCover />
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <a href="https://github.com/shchilkin/album-cover-generator" target="_blank" rel="noopener noreferrer" className="landing-footer__link">
          View source ↗
        </a>
      </footer>
    </div>
  );
}
