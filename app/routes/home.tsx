import { Link } from 'react-router';
import type { MetaFunction } from 'react-router';
import { HeroCover } from '../components/HeroCover';
import { SiteNav } from '../components/SiteNav';

export const meta: MetaFunction = () => [
  { title: 'Album Cover Generator' },
  { name: 'description', content: 'GPU-rendered glitch album covers in your browser. 16 effects, seeded randomness, equirectangular env map export.' },
];

export default function Home() {
  return (
    <div className="landing">
      <SiteNav />
      <main className="landing-main">
        <section className="landing-hero">
          <div className="landing-text">
            <h1 className="landing-headline">
              GPU-rendered<br />glitch covers.
            </h1>
            <ul className="landing-features" aria-label="Features">
              <li>16 GPU effects</li>
              <li>Seeded randomness</li>
              <li>Env map export</li>
              <li>Runs in your browser</li>
            </ul>
            <Link to="/app" className="btn btn-primary landing-cta">
              Open Generator
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
