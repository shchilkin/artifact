import type { PortRowProps } from '../types';

export function PortRow({ inputs, outputs, connected }: PortRowProps) {
  const dot = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    const isConnected = isTarget ? connected.targets.has(key) : connected.sources.has(key);
    return <div className={`node-port-dot${isConnected ? ' node-port-dot-connected' : ''}`} aria-hidden="true" />;
  };
  const portState = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    return (isTarget ? connected.targets.has(key) : connected.sources.has(key)) ? 'connected' : 'disconnected';
  };

  return (
    <div className="node-port-row">
      <div className="node-port-column node-port-column-input">
        {inputs.map(({ label, portId, nodeId }) => (
          <div
            key={portId}
            className="node-port-item"
            data-inspector-connection-state={portState(nodeId, portId, true)}
            aria-label={`${label} input, ${portState(nodeId, portId, true)}`}
          >
            {dot(nodeId, portId, true)}
            <span className="node-port-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="node-port-column node-port-column-output">
        {outputs.map(({ label, portId, nodeId }) => (
          <div
            key={portId}
            className="node-port-item"
            data-inspector-connection-state={portState(nodeId, portId, false)}
            aria-label={`${label} output, ${portState(nodeId, portId, false)}`}
          >
            <span className="node-port-label">{label}</span>
            {dot(nodeId, portId, false)}
          </div>
        ))}
      </div>
    </div>
  );
}
