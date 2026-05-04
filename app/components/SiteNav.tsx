import { Link, NavLink } from 'react-router';

export function SiteNav({ solid }: { solid?: boolean }) {
  return (
    <nav className={solid
      ? 'relative flex items-center justify-between px-6 py-[18px] bg-bg border-b border-border shrink-0 z-[100]'
      : 'fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-6 py-[18px] bg-transparent pointer-events-none [&>*]:pointer-events-auto'
    } aria-label="Site navigation">
      <Link to="/" className="font-display text-[1.1rem] font-black tracking-[0.06em] text-text uppercase no-underline hover:text-accent transition-colors duration-150">ACG</Link>
      <div className="flex items-center gap-6">
        <NavLink to="/examples" className={({ isActive }) => `font-mono text-[0.72rem] tracking-[0.04em] uppercase no-underline transition-colors duration-150 ${isActive ? 'text-text' : 'text-dim hover:text-text'}`}>
          Examples
        </NavLink>
        <NavLink to="/app" className={({ isActive }) => `font-mono text-[0.72rem] tracking-[0.04em] uppercase no-underline transition-colors duration-150 ${isActive ? 'text-text' : 'text-dim hover:text-text'}`}>
          Generator
        </NavLink>
        <a href="https://github.com/shchilkin/album-cover-generator" target="_blank" rel="noopener noreferrer" className="font-mono text-[0.72rem] text-dim tracking-[0.04em] uppercase no-underline hover:text-text transition-colors duration-150">
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
