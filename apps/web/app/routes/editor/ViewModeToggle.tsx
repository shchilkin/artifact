import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs';

import './view-mode-toggle.css';

export type ViewMode = 'layers' | 'nodes';
type ViewModeToggleVariant = 'chrome' | 'floating' | 'node' | 'sidebar';

export function ViewModeToggle({
  value,
  onChange,
  onIntent,
  variant = 'floating',
}: {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Hover or focus on a mode before it is chosen. */
  onIntent?: (mode: ViewMode) => void;
  variant?: ViewModeToggleVariant;
}) {
  return (
    <Tabs
      value={value}
      onValueChange={(next) => onChange(next as ViewMode)}
      className={`view-mode-toggle view-mode-toggle-${variant}`}
    >
      <TabsList>
        <TabsTrigger value="layers" aria-label="Switch to layers view">
          layers
        </TabsTrigger>
        <TabsTrigger
          value="nodes"
          aria-label="Switch to nodes view"
          onPointerEnter={() => onIntent?.('nodes')}
          onFocus={() => onIntent?.('nodes')}
        >
          nodes
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );
}
