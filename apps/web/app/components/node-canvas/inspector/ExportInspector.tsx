import type { AspectRatio, CanvasDocument } from '../../../types/config';
import { ASPECT_SIZES } from '../../../types/config';
import { InspectorStatus } from '../../inspector-system';
import { NoPan } from '../nodes/NoPan';
import { InspectorReadout, InspectorSelect } from './fields';

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
      <InspectorSelect
        label="Output"
        value={exportConfig.target}
        options={['cover', 'envmap']}
        onChange={(value) => onChange({ target: value as CanvasDocument['export']['target'] })}
      />
      <InspectorSelect
        label="Aspect"
        value={aspect}
        options={['1:1', '4:5', '9:16', '16:9']}
        onChange={(value) => onAspectChange(value as AspectRatio)}
      />
      <CoverExportControls exportConfig={exportConfig} height={height} width={width} onChange={onChange} />
      <EnvmapExportLabel target={exportConfig.target} />
      {busy ? (
        <InspectorStatus loading title="Exporting image" tone="info">
          Rendering the current composition at the selected output size.
        </InspectorStatus>
      ) : null}
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

function CoverExportControls({
  exportConfig,
  height,
  onChange,
  width,
}: {
  exportConfig: CanvasDocument['export'];
  height: number;
  onChange: (patch: Partial<CanvasDocument['export']>) => void;
  width: number;
}) {
  if (exportConfig.target !== 'cover') return null;
  return (
    <>
      <InspectorSelect
        label="Format"
        value={exportConfig.format}
        options={['png', 'jpeg']}
        onChange={(value) => onChange({ format: value as CanvasDocument['export']['format'] })}
      />
      <InspectorSelect
        label="Scale"
        value={String(exportConfig.scale)}
        options={['1', '2', '3']}
        onChange={(value) => onChange({ scale: Number(value) as CanvasDocument['export']['scale'] })}
      />
      <InspectorReadout label="Dimensions" value={`${width * exportConfig.scale} × ${height * exportConfig.scale}`} />
    </>
  );
}

function EnvmapExportLabel({ target }: { target: CanvasDocument['export']['target'] }) {
  return target === 'envmap' ? <InspectorReadout label="Dimensions" value="4096 × 2048 PNG" /> : null;
}
