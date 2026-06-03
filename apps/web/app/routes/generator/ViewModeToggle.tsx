import type { CSSProperties } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

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
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as ViewMode)}
      className={`view-mode-toggle view-mode-toggle-${variant}`}
    >
      <TabsList>
        <TabsTrigger value="layers" style={buttonStyle(value === 'layers', 'left')}>
          layers
        </TabsTrigger>
        <TabsTrigger value="nodes" style={buttonStyle(value === 'nodes', 'right')}>
          nodes
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
