import { Link, NavLink } from 'react-router';

export function SiteNav() {
  return (
    <nav className="site-nav" aria-label="Site navigation">
      <Link to="/" className="site-nav__brand">ACG</Link>
      <div className="site-nav__links">
        <NavLink to="/examples" className={({ isActive }) => `site-nav__link${isActive ? ' site-nav__link--active' : ''}`}>
          Examples
        </NavLink>
        <a href="https://github.com/shchilkin/album-cover-generator" target="_blank" rel="noopener noreferrer" className="site-nav__link">
          GitHub ↗
        </a>
      </div>
    </nav>
  );
}
