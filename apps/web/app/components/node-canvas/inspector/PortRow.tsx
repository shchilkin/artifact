import type { PortRowProps } from '../types';

export function PortRow({ inputs, outputs, connected }: PortRowProps) {
  const dot = (connectedState: boolean) => (
    <span className={`node-port-dot${connectedState ? ' node-port-dot-connected' : ''}`} aria-hidden="true" />
  );
  const isPortConnected = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    return isTarget ? connected.targets.has(key) : connected.sources.has(key);
  };

  return (
    <div className="node-port-row">
      <div className="node-port-column node-port-column-input">
        {inputs.map(({ label, portId, nodeId }) => {
          const connectedState = isPortConnected(nodeId, portId, true);
          const state = connectedState ? 'connected' : 'disconnected';
          return (
            <div key={portId} className="node-port-item" data-inspector-connection-state={state}>
              {dot(connectedState)}
              <span className="node-port-label">{label}</span>
              <span className="sr-only">
                {label} input, {state}
              </span>
            </div>
          );
        })}
      </div>
      <div className="node-port-column node-port-column-output">
        {outputs.map(({ label, portId, nodeId }) => {
          const connectedState = isPortConnected(nodeId, portId, false);
          const state = connectedState ? 'connected' : 'disconnected';
          return (
            <div key={portId} className="node-port-item" data-inspector-connection-state={state}>
              <span className="node-port-label">{label}</span>
              {dot(connectedState)}
              <span className="sr-only">
                {label} output, {state}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
