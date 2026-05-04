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
    <div className="flex flex-col min-h-dvh bg-bg overflow-x-hidden overflow-y-auto">
      <SiteNav />
      <div className="landing-grain" aria-hidden="true" />
      <main className="flex-1 flex flex-col justify-center pt-[88px] pb-12 px-[clamp(24px,5vw,72px)]">
        <section className="flex flex-col items-start gap-12 w-full md:flex-row md:items-center">
          <div className="flex flex-col items-start gap-6 flex-1 min-w-0">
            <h1 className="landing-headline">
              Make something<br />
              <span className="landing-headline__weird">weird.</span>
            </h1>
            <div className="w-12 h-0.5 bg-accent shrink-0" aria-hidden="true" />
            <ul className="list-none flex flex-col gap-1 p-0 m-0 landing-features" aria-label="Features">
              <li>16 effects. No two covers alike.</li>
              <li>No account. No install.</li>
            </ul>
            <Link to="/app" className="btn btn-primary text-[0.85rem] px-8 no-underline min-h-[44px] tracking-[0.06em] landing-cta">
              Open Generator →
            </Link>
          </div>
          <div className="-order-1 self-stretch flex items-center justify-start md:order-1 md:shrink-0 md:self-auto md:ml-auto">
            <HeroCover />
          </div>
        </section>
      </main>
    </div>
  );
}
