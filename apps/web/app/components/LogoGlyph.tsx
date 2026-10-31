import { catalogueNumber } from '../utils/appBuildInfo';

interface LogoGlyphProps {
  size?: number;
}

// Record label disc with the "A" knocked out, so the mark reads on any surface.
// The spindle hole drops out below 24px, where it would close up into noise.
const DISC = 'M1 16a15 15 0 1 0 30 0a15 15 0 1 0-30 0Z';
const LETTER = 'M14.5 6h3L25 25h-5l-4-10.1L12 25H7Z';
const SPINDLE = 'M17.6 21.4a1.6 1.6 0 1 0-3.2 0a1.6 1.6 0 1 0 3.2 0Z';

export function LogoGlyph({ size = 32 }: LogoGlyphProps) {
  const detailed = size >= 24;
  return (
    <svg
      aria-hidden="true"
      className="artifact-logo-glyph"
      focusable="false"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <path className="artifact-logo-glyph__disc" d={`${DISC}${LETTER}${detailed ? SPINDLE : ''}`} fillRule="evenodd" />
    </svg>
  );
}

export function CatalogueTag() {
  return <span className="artifact-catalogue-tag">{catalogueNumber()}</span>;
}
