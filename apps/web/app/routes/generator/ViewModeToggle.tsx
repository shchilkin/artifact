import type { CSSProperties } from 'react';

export type ViewMode = 'layers' | 'nodes';

export function ViewModeToggle({
  value,
  onChange,
  variant = 'floating',
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  variant?: 'floating' | 'sidebar';
}) {
  const buttonStyle = (active: boolean, side: 'left' | 'right'): CSSProperties => ({
    minHeight: 'var(--touch)',
    padding: '0 16px',
    fontFamily: 'var(--mono)',
    fontSize: 11,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-dim)',
    border: '1px solid var(--border)',
    borderRight: side === 'left' ? 'none' : undefined,
    borderRadius: 0,
    transition: 'background 120ms ease-out, color 120ms ease-out',
  });

  return (
    <div className={`view-mode-toggle view-mode-toggle-${variant}`}>
      <button type="button" onClick={() => onChange('layers')} style={buttonStyle(value === 'layers', 'left')}>
        layers
      </button>
      <button type="button" onClick={() => onChange('nodes')} style={buttonStyle(value === 'nodes', 'right')}>
        nodes
      </button>
    </div>
  );
}
