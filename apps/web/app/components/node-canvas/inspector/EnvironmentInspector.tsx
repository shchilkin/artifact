import { useState } from 'react';

import type { GraphEnvironmentNode } from '../../../types/config';
import { InspectorSection, InspectorTextInput } from './fields';

function environmentFileSummary(environmentNode: GraphEnvironmentNode) {
  if (environmentNode.environmentName) return environmentNode.environmentName;
  if (environmentNode.environmentSrc) return 'Embedded EXR / HDR';
  return 'Drop EXR / HDR';
}

export function EnvironmentInspector({
  environmentNode,
  onChange,
  detached = false,
}: {
  environmentNode: GraphEnvironmentNode;
  onChange: (patch: Partial<GraphEnvironmentNode>) => void;
  detached?: boolean;
}) {
  const [openSection, setOpenSection] = useState<'file' | 'usage'>('file');
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorSection
        title="File"
        summary={environmentFileSummary(environmentNode)}
        open={openSection === 'file'}
        onToggle={() => setOpenSection((current) => (current === 'file' ? 'usage' : 'file'))}
      >
        <InspectorTextInput value={environmentNode.name} onChange={(name) => onChange({ name })} />
        <div className="node-inspector-readout">
          <span>Environment map</span>
          <strong>{environmentNode.environmentName || 'No EXR / HDR loaded'}</strong>
          {environmentNode.environmentBytes > 0 ? (
            <small>
              {environmentNode.environmentMime || 'environment'} · {Math.round(environmentNode.environmentBytes / 1024)}{' '}
              KB
            </small>
          ) : (
            <small>Drop an EXR or HDR file, then connect this node to a 3D Scene environment port.</small>
          )}
        </div>
      </InspectorSection>
      <InspectorSection
        title="Usage"
        summary="Lighting input"
        open={openSection === 'usage'}
        onToggle={() => setOpenSection((current) => (current === 'usage' ? 'file' : 'usage'))}
      >
        <div className="node-inspector-readout">
          <span>Feeds</span>
          <strong>Scene environment</strong>
          <small>Used for model lighting and reflections. The scene controls strength and background visibility.</small>
        </div>
      </InspectorSection>
    </div>
  );
}
