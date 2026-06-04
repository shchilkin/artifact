import type { EffectPreset, LayerKind } from '../../types/config';
import { LAYER_STARTER_DOCUMENTS } from '../../utils/starterDocuments';
import type { TextPresetId } from '../../utils/textPresets';
import { ActionButton, ActionLink } from '../ui/ActionButton';

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
        <ActionButton onClick={() => onAddLayer('image')} variant="secondary">
          Image
        </ActionButton>
        <ActionButton onClick={onStartAiImage} disabled={!onStartAiImage} variant="secondary">
          AI
        </ActionButton>
        <ActionButton onClick={() => onAddTextPreset('title')} variant="secondary">
          Title
        </ActionButton>
        <ActionButton onClick={() => onAddLayer('text')} variant="secondary">
          Text
        </ActionButton>
      </div>
      <div className="layer-empty-actions">
        <ActionButton onClick={() => onAddLayer('fill')} variant="quiet">
          Fill
        </ActionButton>
        <ActionButton onClick={() => onAddLayer('noise')} variant="quiet">
          Noise
        </ActionButton>
        <ActionButton onClick={() => onAddEffectPreset('grain')} variant="quiet">
          Grain
        </ActionButton>
        <ActionButton onClick={() => onAddEffectPreset('pixelate')} variant="quiet">
          Pixelate
        </ActionButton>
      </div>
      {onLoadStarter && (
        <div className="layer-empty-starters" aria-label="Layer starter recipes">
          {quickStarters.map((starter) => (
            <ActionButton key={starter.id} onClick={() => onLoadStarter(starter.id)} variant="quiet">
              {starter.shortName}
            </ActionButton>
          ))}
        </div>
      )}
      <div className="layer-empty-actions layer-empty-actions-secondary">
        <ActionButton onClick={onRandomize} disabled={!onRandomize} aria-label="Randomize empty canvas" variant="quiet">
          Rand
        </ActionButton>
        <ActionButton onClick={onOpenProjects} disabled={!onOpenProjects} aria-label="Open saved work" variant="quiet">
          Projects
        </ActionButton>
        <ActionLink to="/showcase" variant="quiet">
          Showcase
        </ActionLink>
      </div>
    </div>
  );
}
