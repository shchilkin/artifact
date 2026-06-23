interface LogoGlyphProps {
  size?: number;
  variant?: 'frame' | 'path' | 'stack';
}

export function LogoGlyph({ size = 32, variant = 'frame' }: LogoGlyphProps) {
  return (
    <svg
      aria-hidden="true"
      className={`artifact-logo-glyph artifact-logo-glyph--${variant}`}
      focusable="false"
      height={size}
      viewBox="0 0 32 32"
      width={size}
    >
      <rect className="artifact-logo-glyph__field" width="32" height="32" />
      {variant === 'frame' ? <FrameMark /> : null}
      {variant === 'path' ? <PathMark /> : null}
      {variant === 'stack' ? <StackMark /> : null}
    </svg>
  );
}

function FrameMark() {
  return (
    <>
      <path className="artifact-logo-glyph__frame" d="M8 7h16v18H8z" />
      <path className="artifact-logo-glyph__signal" d="M7 16h18" />
      <path className="artifact-logo-glyph__signal artifact-logo-glyph__signal--vertical" d="M16 8v16" />
      <circle className="artifact-logo-glyph__node" cx="16" cy="16" r="4.5" />
      <path className="artifact-logo-glyph__crop" d="M5 5h6M5 5v6M27 5h-6M27 5v6M5 27h6M5 27v-6M27 27h-6M27 27v-6" />
    </>
  );
}

function PathMark() {
  return (
    <>
      <path className="artifact-logo-glyph__frame artifact-logo-glyph__frame--soft" d="M7 7h18v18H7z" />
      <path className="artifact-logo-glyph__path" d="M7 20c4.2-9.5 11.2-9.5 18 0" />
      <path className="artifact-logo-glyph__path artifact-logo-glyph__path--quiet" d="M7 12c4.2 9.5 11.2 9.5 18 0" />
      <circle className="artifact-logo-glyph__node" cx="7" cy="20" r="3.2" />
      <circle className="artifact-logo-glyph__node" cx="16" cy="16" r="4.4" />
      <circle className="artifact-logo-glyph__node" cx="25" cy="20" r="3.2" />
    </>
  );
}

function StackMark() {
  return (
    <>
      <path className="artifact-logo-glyph__frame artifact-logo-glyph__frame--soft" d="M8 9h13v13H8z" />
      <path className="artifact-logo-glyph__frame" d="M12 6h12v12H12z" />
      <path className="artifact-logo-glyph__signal" d="M8 24h16" />
      <circle className="artifact-logo-glyph__node" cx="24" cy="24" r="3.8" />
      <path className="artifact-logo-glyph__crop" d="M5 5h5M5 5v5M27 27h-5M27 27v-5" />
    </>
  );
}
