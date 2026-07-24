import { type ChangeEvent, useRef, useState } from 'react';

import type { GraphEnvironmentNode } from '../../../types/config';
import { NoPan } from '../nodes/NoPan';
import { InspectorReadout, InspectorSection, InspectorTextInput } from './fields';

function environmentFileSummary(environmentNode: GraphEnvironmentNode) {
  if (environmentNode.environmentName) return environmentNode.environmentName;
  if (environmentNode.environmentSrc) return 'Embedded EXR / HDR';
  return 'Drop EXR / HDR';
}

export function EnvironmentInspector({
  environmentNode,
  onChange,
  onLoadFile,
  detached = false,
}: {
  environmentNode: GraphEnvironmentNode;
  onChange: (patch: Partial<GraphEnvironmentNode>) => void;
  onLoadFile?: (file: File) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<'file' | 'usage'>('file');
  const inputRef = useRef<HTMLInputElement>(null);
  const loadLabel = environmentNode.environmentSrc ? 'Replace map' : 'Load EXR/HDR';
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (file) onLoadFile?.(file);
  };

  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorSection
        title="File"
        summary={environmentFileSummary(environmentNode)}
        open={openSection === 'file'}
        onToggle={() => setOpenSection((current) => (current === 'file' ? 'usage' : 'file'))}
      >
        <InspectorTextInput label="Name" value={environmentNode.name} onChange={(name) => onChange({ name })} />
        <InspectorReadout
          label="Environment map"
          value={environmentNode.environmentName || 'No EXR / HDR loaded'}
          detail={
            environmentNode.environmentBytes > 0
              ? `${environmentNode.environmentMime || 'environment'} · ${Math.round(environmentNode.environmentBytes / 1024)} KB`
              : 'Drop an EXR or HDR file, then connect this node to a 3D Scene environment port.'
          }
        />
        <NoPan
          as="button"
          type="button"
          className="node-inspector-action environment-load-action"
          disabled={!onLoadFile}
          onClick={() => inputRef.current?.click()}
        >
          {loadLabel}
        </NoPan>
        <input
          ref={inputRef}
          type="file"
          accept=".exr,.hdr,image/x-exr,image/vnd.radiance"
          className="node-hidden-file-input"
          onChange={handleFileChange}
          tabIndex={-1}
        />
      </InspectorSection>
      <InspectorSection
        title="Usage"
        summary="Lighting input"
        open={openSection === 'usage'}
        onToggle={() => setOpenSection((current) => (current === 'usage' ? 'file' : 'usage'))}
      >
        <InspectorReadout
          label="Feeds"
          value="Scene environment"
          detail="Used for model lighting and reflections. The scene controls strength and background visibility."
        />
      </InspectorSection>
    </div>
  );
}
