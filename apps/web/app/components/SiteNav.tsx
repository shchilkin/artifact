import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useArtifactAuth } from '../hooks/useArtifactAuth';
import { LogoGlyph } from './LogoGlyph';
import { ActionButton } from './ui/ActionButton';
import { actionButtonClassName } from './ui/actionButtonClassName';

const LINKS = [
  { to: '/projects', label: 'Projects' },
  { to: '/docs', label: 'Docs' },
  { to: '/showcase', label: 'Showcase' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) => `site-nav-link ${isActive ? 'site-nav-link-active' : ''}`;

export function SiteNav({ solid, compact }: { solid?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const auth = useArtifactAuth();

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`site-nav ${solid ? 'site-nav--solid' : 'site-nav--floating'} ${compact ? 'site-nav-compact' : ''}`}
        aria-label="Site navigation"
      >
        <Link to="/" className="site-nav-brand">
          <LogoGlyph />
          <span className="site-nav-brand-text">artifact</span>
        </Link>
        <DesktopNavLinks compact={compact} auth={auth} />
        <MobileNavToggle compact={compact} open={open} onToggle={() => setOpen((o) => !o)} />
      </motion.nav>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        <MobileNavMenu open={open} compact={compact} solid={solid} auth={auth} onClose={() => setOpen(false)} />
      </AnimatePresence>
    </>
  );
}

function DesktopNavLinks({ compact, auth }: { compact?: boolean; auth: ReturnType<typeof useArtifactAuth> }) {
  if (compact) return null;
  return (
    <div className="site-nav-desktop-links">
      {LINKS.map(({ to, label }) => (
        <NavLink key={to} to={to} className={linkClass}>
          {label}
        </NavLink>
      ))}
      <GitHubNavLink className="site-nav-link" />
      <NavLink
        to="/app?new=blank"
        className={({ isActive }) => actionButtonClassName({ active: isActive, variant: 'primary' })}
      >
        Open editor
      </NavLink>
      <AccountButton auth={auth} />
    </div>
  );
}

function MobileNavToggle({ compact, open, onToggle }: { compact?: boolean; open: boolean; onToggle: () => void }) {
  if (compact) return null;
  return (
    <button
      type="button"
      className="site-nav-mobile-toggle"
      onClick={onToggle}
      aria-label={mobileToggleLabel(open)}
      aria-expanded={open}
      aria-controls="mobile-nav-menu"
    >
      {mobileToggleBarClasses(open).map((className, index) => (
        <MobileNavToggleBar key={index} className={className} />
      ))}
    </button>
  );
}

function mobileToggleLabel(open: boolean) {
  return open ? 'Close menu' : 'Open menu';
}

function mobileToggleBarClasses(open: boolean) {
  if (!open) return ['site-nav-toggle-bar', 'site-nav-toggle-bar', 'site-nav-toggle-bar'];
  return [
    'site-nav-toggle-bar site-nav-toggle-bar--open-top',
    'site-nav-toggle-bar site-nav-toggle-bar--open-middle',
    'site-nav-toggle-bar site-nav-toggle-bar--open-bottom',
  ];
}

function MobileNavToggleBar({ className }: { className: string }) {
  return <span className={className} />;
}

function MobileNavMenu({
  open,
  compact,
  solid,
  auth,
  onClose,
}: {
  open: boolean;
  compact?: boolean;
  solid?: boolean;
  auth: ReturnType<typeof useArtifactAuth>;
  onClose: () => void;
}) {
  if (!open || compact) return null;
  return (
    <motion.div
      id="mobile-nav-menu"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
      className={`site-nav-mobile-menu ${solid ? 'site-nav-mobile-menu--solid' : 'site-nav-mobile-menu--floating'}`}
    >
      {LINKS.map(({ to, label }) => (
        <NavLink key={to} to={to} onClick={onClose} className={mobileLinkClass}>
          {label}
        </NavLink>
      ))}
      <NavLink
        to="/app?new=blank"
        onClick={onClose}
        className={({ isActive }) =>
          actionButtonClassName({ active: isActive, className: 'site-nav-mobile-action', variant: 'primary' })
        }
      >
        Open editor
      </NavLink>
      <GitHubNavLink className="site-nav-mobile-link" />
      <AccountButton auth={auth} />
    </motion.div>
  );
}

const mobileLinkClass = ({ isActive }: { isActive: boolean }) =>
  `site-nav-mobile-link ${isActive ? 'site-nav-link-active' : ''}`;

function GitHubNavLink({ className }: { className: string }) {
  return (
    <a
      href="https://github.com/shchilkin/album-cover-generator"
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      GitHub ↗
    </a>
  );
}

function AccountButton({ auth }: { auth: ReturnType<typeof useArtifactAuth> }) {
  if (!auth.configured) return null;
  const copy = accountButtonCopy(auth);
  return (
    <ActionButton variant="secondary" onClick={copy.onClick} disabled={!auth.loaded}>
      {copy.label}
    </ActionButton>
  );
}

function accountButtonCopy(auth: ReturnType<typeof useArtifactAuth>) {
  if (!auth.loaded) return { label: 'Account', onClick: auth.openSignIn };
  return auth.signedIn
    ? { label: 'Sign Out', onClick: () => void auth.signOut() }
    : { label: 'Sign In', onClick: auth.openSignIn };
}
