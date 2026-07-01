import type { CSSProperties } from 'react';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

export type ViewMode = 'layers' | 'nodes';
type ViewModeToggleVariant = 'chrome' | 'floating' | 'node' | 'sidebar';

const BASE_BUTTON_STYLE: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  letterSpacing: 'var(--tracking-command)',
  textTransform: 'uppercase',
  cursor: 'pointer',
  border: '1px solid var(--border)',
  borderRadius: 0,
  transition: 'background 120ms ease-out, color 120ms ease-out',
};

const BUTTON_SIZE_STYLE: Record<ViewModeToggleVariant, CSSProperties> = {
  chrome: {
    minHeight: 'var(--touch)',
    padding: '0 14px',
    fontSize: 'var(--type-ui-sm)',
  },
  floating: {
    minHeight: 'var(--touch)',
    padding: '0 16px',
    fontSize: 'var(--type-ui-sm)',
  },
  node: {
    minHeight: 'var(--touch)',
    padding: '0 14px',
    fontSize: 'var(--type-ui-sm)',
  },
  sidebar: {
    minHeight: 'var(--touch)',
    padding: '0 16px',
    fontSize: 'var(--type-ui-sm)',
  },
};

function viewModeButtonStyle(active: boolean, side: 'left' | 'right', variant: ViewModeToggleVariant): CSSProperties {
  return {
    ...BASE_BUTTON_STYLE,
    ...BUTTON_SIZE_STYLE[variant],
    background: active ? 'var(--text)' : 'transparent',
    color: active ? 'var(--bg)' : 'var(--text-dim)',
    borderRight: side === 'left' ? 'none' : undefined,
  };
}

export function ViewModeToggle({
  value,
  onChange,
  variant = 'floating',
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  variant?: ViewModeToggleVariant;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as ViewMode)}
      className={`view-mode-toggle view-mode-toggle-${variant}`}
    >
      <TabsList>
        <TabsTrigger
          value="layers"
          style={viewModeButtonStyle(value === 'layers', 'left', variant)}
          aria-label="Switch to layers view"
        >
          layers
        </TabsTrigger>
        <TabsTrigger
          value="nodes"
          style={viewModeButtonStyle(value === 'nodes', 'right', variant)}
          aria-label="Switch to nodes view"
        >
          nodes
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
