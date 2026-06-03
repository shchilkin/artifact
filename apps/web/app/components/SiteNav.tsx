import { AnimatePresence, motion } from 'framer-motion';
import { useState } from 'react';
import { Link, NavLink } from 'react-router';
import { useArtifactAuth } from '../hooks/useArtifactAuth';
import { LogoGlyph } from './LogoGlyph';
import { ActionButton } from './ui/ActionButton';
import { actionButtonClassName } from './ui/actionButtonClassName';

const LINKS = [
  { to: '/docs/nodes', label: 'Docs' },
  { to: '/showcase', label: 'Showcase' },
] as const;

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-3 font-mono text-[14px] tracking-[0.04em] uppercase no-underline transition-colors duration-150 ${
    isActive ? 'text-text' : 'text-dim hover:text-text'
  }`;

export function SiteNav({ solid, compact }: { solid?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const auth = useArtifactAuth();

  const accountButton = auth.configured ? (
    <ActionButton
      variant="secondary"
      onClick={auth.signedIn ? () => void auth.signOut() : auth.openSignIn}
      disabled={!auth.loaded}
    >
      {auth.loaded ? (auth.signedIn ? 'Sign Out' : 'Sign In') : 'Account'}
    </ActionButton>
  ) : null;

  return (
    <>
      <motion.nav
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={
          solid
            ? `relative flex items-center justify-between px-5 py-2.5 bg-bg border-b border-border shrink-0 z-[100] ${
                compact ? 'site-nav-compact' : ''
              } gap-3`
            : 'fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 px-5 py-2.5 bg-transparent pointer-events-none *:pointer-events-auto'
        }
        aria-label="Site navigation"
      >
        <Link to="/" className="group flex min-h-[44px] items-center gap-2 no-underline">
          <LogoGlyph />
          <span className="font-display text-[20px] font-black tracking-[0] leading-none text-text group-hover:text-accent transition-colors duration-150">
            artifact
          </span>
        </Link>
        {/* Desktop links */}
        {!compact && (
          <div className="hidden md:flex items-center gap-5">
            {LINKS.map(({ to, label }) => (
              <NavLink key={to} to={to} className={linkClass}>
                {label}
              </NavLink>
            ))}
            <a
              href="https://github.com/shchilkin/album-cover-generator"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center px-3 font-mono text-[14px] text-dim tracking-[0.04em] uppercase no-underline hover:text-text transition-colors duration-150"
            >
              GitHub ↗
            </a>
            <NavLink
              to="/app?new=blank"
              className={({ isActive }) => actionButtonClassName({ active: isActive, variant: 'primary' })}
            >
              Open editor
            </NavLink>
            {accountButton}
          </div>
        )}

        {/* Mobile hamburger — 44px touch target */}
        {!compact && (
          <button
            type="button"
            className="md:hidden flex flex-col justify-center items-center gap-[5px] w-[44px] h-[44px] bg-transparent border-0 cursor-pointer p-0"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobile-nav-menu"
          >
            <span
              className={`block h-px w-5 bg-text transition-transform duration-200 origin-center ${
                open ? 'translate-y-[6px] rotate-45' : ''
              }`}
            />
            <span className={`block h-px w-5 bg-text transition-opacity duration-200 ${open ? 'opacity-0' : ''}`} />
            <span
              className={`block h-px w-5 bg-text transition-transform duration-200 origin-center ${
                open ? '-translate-y-[6px] -rotate-45' : ''
              }`}
            />
          </button>
        )}
      </motion.nav>

      {/* Mobile menu dropdown */}
      <AnimatePresence>
        {open && !compact && (
          <motion.div
            id="mobile-nav-menu"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            className={`md:hidden bg-bg border-b border-border px-5 py-3 flex flex-col pointer-events-auto ${
              solid ? 'relative z-[99]' : 'fixed top-[52px] left-0 right-0 z-[99]'
            }`}
          >
            {LINKS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setOpen(false)}
                className={({ isActive }) =>
                  `flex min-h-[44px] items-center font-mono text-[15px] tracking-[0.04em] uppercase no-underline transition-colors duration-150 py-3 border-b border-border last:border-0 ${
                    isActive ? 'text-text' : 'text-dim hover:text-text'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
            <NavLink
              to="/app?new=blank"
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                actionButtonClassName({ active: isActive, className: 'site-nav-mobile-action', variant: 'primary' })
              }
            >
              Open editor
            </NavLink>
            <a
              href="https://github.com/shchilkin/album-cover-generator"
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[44px] items-center font-mono text-[15px] text-dim tracking-[0.04em] uppercase no-underline hover:text-text transition-colors duration-150 py-3"
            >
              GitHub ↗
            </a>
            {accountButton}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
