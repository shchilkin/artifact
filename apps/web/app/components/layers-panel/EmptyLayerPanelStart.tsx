import { Link } from 'react-router';
import type { EffectPreset, LayerKind } from '../../types/config';

export function EmptyLayerPanelStart({
  onAddLayer,
  onAddEffectPreset,
}: {
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
}) {
  return (
    <div className="layer-empty-state">
      <p>Start with one layer, then stack from there.</p>
      <div className="layer-empty-actions">
        <button type="button" onClick={() => onAddLayer('image')}>
          Image
        </button>
        <button type="button" onClick={() => onAddLayer('text')}>
          Text
        </button>
        <button type="button" onClick={() => onAddLayer('fill')}>
          Fill
        </button>
        <button type="button" onClick={() => onAddLayer('noise')}>
          Noise
        </button>
        <button type="button" onClick={() => onAddEffectPreset('grain')}>
          Grain
        </button>
        <Link to="/examples">Examples</Link>
      </div>
    </div>
  );
}
