import vuLogo from '../assets/Vantaa Underground Logo.png';
import { LogoGlyph } from './LogoGlyph';

export function Footer() {
  return (
    <footer className="product-footer">
      <div className="product-footer__brand" aria-label="Artifact">
        <LogoGlyph />
        <span>Artifact</span>
      </div>
      <nav className="product-footer__links" aria-label="Project links">
        <a
          href="https://vantaa-underground.com"
          target="_blank"
          rel="noopener noreferrer"
          className="product-footer__link"
        >
          <img src={vuLogo} alt="" />
          <span>
            Part of <strong>Vantaa Underground</strong>
          </span>
        </a>
        <a href="https://shchilkin.dev" target="_blank" rel="noopener noreferrer" className="product-footer__link">
          <span>
            Made by <strong>Aleksandr Shchilkin</strong>
          </span>
        </a>
      </nav>
    </footer>
  );
}
