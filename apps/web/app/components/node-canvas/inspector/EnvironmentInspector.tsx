import type { GraphEnvironmentNode } from '../../../types/config';
import { InspectorTextInput } from './fields';

export function EnvironmentInspector({
  environmentNode,
  onChange,
  detached = false,
}: {
  environmentNode: GraphEnvironmentNode;
  onChange: (patch: Partial<GraphEnvironmentNode>) => void;
  detached?: boolean;
}) {
  return (
    <div className={detached ? 'node-inspector-stack' : 'node-inspector-stack node-inspector-detached'}>
      <InspectorTextInput value={environmentNode.name} onChange={(name) => onChange({ name })} />
      <div className="node-inspector-readout">
        <span>Environment</span>
        <strong>{environmentNode.environmentName || 'No file'}</strong>
        {environmentNode.environmentBytes > 0 && (
          <small>
            {environmentNode.environmentMime || 'environment'} · {Math.round(environmentNode.environmentBytes / 1024)}{' '}
            KB
          </small>
        )}
      </div>
    </div>
  );
}
