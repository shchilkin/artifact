import { SegmentedControl, SegmentedControlTrigger } from '../ui/SegmentedControl';

/** Custom graphs show either the graph-derived structure or the area folders over a flat list. */
export type LayerPanelView = 'structure' | 'areas';

const VIEW_OPTIONS: Array<{ view: LayerPanelView; label: string; title: string }> = [
  { view: 'structure', label: 'Structure', title: 'Show how layers and nodes reach Output' },
  { view: 'areas', label: 'Areas', title: 'Show layers grouped by area' },
];

export function LayerPanelViewSwitch({
  value,
  onChange,
}: {
  value: LayerPanelView;
  onChange: (view: LayerPanelView) => void;
}) {
  return (
    <div className="layer-panel-view-switch">
      <SegmentedControl aria-label="Layers view">
        {VIEW_OPTIONS.map((option) => (
          <SegmentedControlTrigger
            key={option.view}
            aria-pressed={value === option.view}
            title={option.title}
            onClick={() => onChange(option.view)}
          >
            {option.label}
          </SegmentedControlTrigger>
        ))}
      </SegmentedControl>
    </div>
  );
}
