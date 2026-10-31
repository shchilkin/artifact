import { InspectorSelect } from '../node-canvas/inspector/fields';

const NO_PRESET = '';

/**
 * "Start from": applies one of a source's presets to the current target, keeping its name. The select always shows
 * its placeholder, since the target may have been edited since.
 */
export function PresetStartSelect<P extends { name?: string }>({
  presets,
  onApply,
}: {
  presets: Readonly<Record<string, { name: string; patch: P }>>;
  onApply: (patch: Omit<P, 'name'>) => void;
}) {
  return (
    <InspectorSelect
      label="Start from"
      value={NO_PRESET}
      options={[
        { value: NO_PRESET, label: 'Choose a preset…' },
        ...Object.entries(presets).map(([value, preset]) => ({ value, label: preset.name })),
      ]}
      onChange={(value) => {
        const preset = presets[value];
        if (!preset) return;
        const { name, ...patch } = preset.patch;
        void name;
        onApply(patch);
      }}
    />
  );
}
