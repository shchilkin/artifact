import type { PortRowProps } from '../types';

export function PortRow({ inputs, outputs, connected }: PortRowProps) {
  const dot = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    const isConnected = isTarget ? connected.targets.has(key) : connected.sources.has(key);
    return <div className={`node-port-dot${isConnected ? ' node-port-dot-connected' : ''}`} aria-hidden="true" />;
  };

  return (
    <div className="node-port-row">
      <div className="node-port-column node-port-column-input">
        {inputs.map(({ label, portId, nodeId }) => (
          <div key={portId} className="node-port-item">
            {dot(nodeId, portId, true)}
            <span className="node-port-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="node-port-column node-port-column-output">
        {outputs.map(({ label, portId, nodeId }) => (
          <div key={portId} className="node-port-item">
            <span className="node-port-label">{label}</span>
            {dot(nodeId, portId, false)}
          </div>
        ))}
      </div>
    </div>
  );
}
