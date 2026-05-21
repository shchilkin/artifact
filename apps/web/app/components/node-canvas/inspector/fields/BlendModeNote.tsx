import type { BlendMode } from '../../../layer-controls/fieldDefs';
import { BLEND_MODE_HELP } from '../../../layer-controls/fieldDefs';

export function BlendModeNote({ value }: { value: string }) {
  const mode = (value in BLEND_MODE_HELP ? value : 'normal') as BlendMode;

  return (
    <p className="node-inspector-note">
      {mode}: {BLEND_MODE_HELP[mode]}
    </p>
  );
}
