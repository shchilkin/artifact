import { Link } from 'react-router';
import type { EffectPreset, LayerKind } from '../../types/config';
import { LAYER_STARTER_DOCUMENTS } from '../../utils/starterDocuments';
import type { TextPresetId } from '../../utils/textPresets';

export function EmptyLayerPanelStart({
  onAddLayer,
  onAddEffectPreset,
  onAddTextPreset,
  onStartAiImage,
  onLoadStarter,
  onOpenProjects,
  onRandomize,
}: {
  onAddLayer: (kind: Exclude<LayerKind, 'effect'>) => void;
  onAddEffectPreset: (preset: EffectPreset) => void;
  onAddTextPreset: (preset: TextPresetId) => void;
  onStartAiImage?: () => void;
  onLoadStarter?: (id: string) => void;
  onOpenProjects?: () => void;
  onRandomize?: () => void;
}) {
  const quickStarters = LAYER_STARTER_DOCUMENTS.slice(0, 3);

  return (
    <div className="layer-empty-state">
      <span className="layer-empty-kicker">Fast starts</span>
      <p>Pick a source, recipe, or saved project.</p>
      <div className="layer-empty-actions layer-empty-actions-primary">
        <button type="button" onClick={() => onAddLayer('image')}>
          Image
        </button>
        <button type="button" onClick={onStartAiImage} disabled={!onStartAiImage}>
          AI
        </button>
        <button type="button" onClick={() => onAddTextPreset('title')}>
          Title
        </button>
        <button type="button" onClick={() => onAddLayer('text')}>
          Text
        </button>
      </div>
      <div className="layer-empty-actions">
        <button type="button" onClick={() => onAddLayer('fill')}>
          Fill
        </button>
        <button type="button" onClick={() => onAddLayer('noise')}>
          Noise
        </button>
        <button type="button" onClick={() => onAddEffectPreset('grain')}>
          Grain
        </button>
        <button type="button" onClick={() => onAddEffectPreset('pixelate')}>
          Pixelate
        </button>
      </div>
      {onLoadStarter && (
        <div className="layer-empty-starters" aria-label="Layer starter recipes">
          {quickStarters.map((starter) => (
            <button key={starter.id} type="button" onClick={() => onLoadStarter(starter.id)}>
              {starter.shortName}
            </button>
          ))}
        </div>
      )}
      <div className="layer-empty-actions layer-empty-actions-secondary">
        <button type="button" onClick={onRandomize} disabled={!onRandomize} aria-label="Randomize empty canvas">
          Rand
        </button>
        <button type="button" onClick={onOpenProjects} disabled={!onOpenProjects} aria-label="Open saved work">
          Projects
        </button>
        <Link to="/examples">Examples</Link>
      </div>
    </div>
  );
}
