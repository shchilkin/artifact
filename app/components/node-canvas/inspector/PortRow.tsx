import type { PortRowProps } from '../types';

export function PortRow({ inputs, outputs, connected }: PortRowProps) {
  const dot = (nodeId: string, portId: string, isTarget: boolean) => {
    const key = `${nodeId}::${portId}`;
    const isConnected = isTarget ? connected.targets.has(key) : connected.sources.has(key);
    return (
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: isConnected ? 'var(--accent)' : 'transparent',
          border: `1px solid ${isConnected ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'background 120ms, border-color 120ms',
        }}
      />
    );
  };

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '4px 9px 7px',
        minHeight: 20,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {inputs.map(({ label, portId, nodeId }) => (
          <div key={portId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {dot(nodeId, portId, true)}
            <span style={{ color: 'var(--text-dim)', fontSize: 9, fontFamily: 'var(--mono)' }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        {outputs.map(({ label, portId, nodeId }) => (
          <div key={portId} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ color: 'var(--text-dim)', fontSize: 9, fontFamily: 'var(--mono)' }}>{label}</span>
            {dot(nodeId, portId, false)}
          </div>
        ))}
      </div>
    </div>
  );
}
