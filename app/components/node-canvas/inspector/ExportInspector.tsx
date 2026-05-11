import type { AspectRatio, CanvasDocument } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { NoPan } from '../nodes/NoPan';
import { InspectorLabel, InspectorSelect } from './fields';

export function ExportInspector({
  exportConfig,
  aspect,
  busy,
  onChange,
  onAspectChange,
  onExport,
}: {
  exportConfig: CanvasDocument['export'];
  aspect: AspectRatio;
  busy: boolean;
  onChange: (patch: Partial<CanvasDocument['export']>) => void;
  onAspectChange: (aspect: AspectRatio) => void;
  onExport: () => void;
}) {
  const [width, height] = ASPECT_SIZES[aspect ?? '1:1'];

  return (
    <div className="node-inspector-stack">
      <InspectorSelect label="Output" value={exportConfig.target} options={['cover', 'envmap']} onChange={(value) => onChange({ target: value as CanvasDocument['export']['target'] })} />
      <InspectorSelect
        label="Aspect"
        value={aspect}
        options={['1:1', '4:5', '9:16', '16:9']}
        onChange={(value) => onAspectChange(value as AspectRatio)}
      />
      {exportConfig.target === 'cover' && (
        <>
          <InspectorSelect label="Format" value={exportConfig.format} options={['png', 'jpeg']} onChange={(value) => onChange({ format: value as CanvasDocument['export']['format'] })} />
          <InspectorSelect label="Scale" value={String(exportConfig.scale)} options={['1', '2', '3']} onChange={(value) => onChange({ scale: Number(value) as CanvasDocument['export']['scale'] })} />
          <InspectorLabel>{`${width * exportConfig.scale} × ${height * exportConfig.scale}`}</InspectorLabel>
        </>
      )}
      {exportConfig.target === 'envmap' && (
        <InspectorLabel>4096 × 2048 png</InspectorLabel>
      )}
      <NoPan
        as="button"
        type="button"
        className="node-shell-action node-export-button"
        onClick={onExport}
        disabled={busy}
      >
        {busy ? 'exporting…' : 'Export image'}
      </NoPan>
    </div>
  );
}
