import { Handle, Position } from '@xyflow/react';
import type { CSSProperties, KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';

import { HANDLE_STYLE, KIND_COLOR, NODE_W } from '../constants';
import type { ConnectedNodePorts } from '../types';
import { NodeShell } from './NodeShell';

interface NodeHandleConfig {
  id: string;
  top?: string;
}

interface NodeFrameProps {
  id: string;
  kind: string;
  label: string;
  name: string;
  selected: boolean;
  outputPath: boolean;
  editing: boolean;
  muted?: boolean;
  targetHandles: NodeHandleConfig[];
  sourceHandles?: NodeHandleConfig[];
  connected?: ConnectedNodePorts;
  onSelect: (event?: ReactMouseEvent<HTMLDivElement>) => void;
  onToggleMuted?: () => void;
  onDelete?: () => void;
  onDragHandlePointerDown?: () => void;
  deleteDisabled?: boolean;
  children: ReactNode;
}

export function NodeFrame({
  id,
  kind,
  label,
  name,
  selected,
  outputPath,
  editing,
  muted,
  targetHandles,
  sourceHandles = [{ id: 'out' }],
  connected,
  onSelect,
  onToggleMuted,
  onDelete,
  onDragHandlePointerDown,
  deleteDisabled,
  children,
}: NodeFrameProps) {
  const accent = KIND_COLOR[kind] ?? 'var(--accent-primary)';
  const frameStyle = {
    '--node-accent': accent,
    '--node-default-width': `${NODE_W}px`,
    position: 'relative',
    zIndex: editing ? 4 : 1,
  } as CSSProperties;
  return (
    <div
      className="node-frame"
      data-node-id={id}
      data-node-kind={kind}
      data-node-selected={selected || undefined}
      data-node-output-path={outputPath || undefined}
      data-node-muted={muted || undefined}
      data-node-locked={deleteDisabled || undefined}
      style={frameStyle}
    >
      {targetHandles.map((handle) => (
        <Handle
          key={`target:${handle.id}`}
          type="target"
          position={Position.Left}
          id={handle.id}
          className={nodeHandleClassName(isConnected(connected, 'targets', id, handle.id))}
          aria-label={nodeHandleLabel(handle.id, 'input', isConnected(connected, 'targets', id, handle.id))}
          data-node-port-state={isConnected(connected, 'targets', id, handle.id) ? 'connected' : 'disconnected'}
          tabIndex={0}
          style={handle.top ? { ...HANDLE_STYLE, top: handle.top } : HANDLE_STYLE}
        />
      ))}
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={nodeFrameLabel({ name, label, selected, outputPath, muted, locked: deleteDisabled })}
        onClick={(event) => onSelect(event)}
        onFocus={() => onSelect()}
        onKeyDown={(event) => handleNodeKeyDown(event, () => onSelect())}
      >
        <NodeShell
          kind={kind}
          label={label}
          name={name}
          selected={selected}
          outputPath={outputPath}
          muted={muted}
          expanded={editing}
          expandable
          onToggleMuted={onToggleMuted}
          onDelete={onDelete}
          onDragHandlePointerDown={onDragHandlePointerDown}
          deleteDisabled={deleteDisabled}
        >
          {children}
        </NodeShell>
      </div>
      {sourceHandles.map((handle) => (
        <Handle
          key={`source:${handle.id}`}
          type="source"
          position={Position.Right}
          id={handle.id}
          className={nodeHandleClassName(isConnected(connected, 'sources', id, handle.id))}
          aria-label={nodeHandleLabel(handle.id, 'output', isConnected(connected, 'sources', id, handle.id))}
          data-node-port-state={isConnected(connected, 'sources', id, handle.id) ? 'connected' : 'disconnected'}
          tabIndex={0}
          style={handle.top ? { ...HANDLE_STYLE, top: handle.top } : HANDLE_STYLE}
        />
      ))}
    </div>
  );
}

function isConnected(
  connected: ConnectedNodePorts | undefined,
  side: keyof ConnectedNodePorts,
  nodeId: string,
  handleId: string,
) {
  return connected?.[side].has(`${nodeId}::${handleId}`) ?? false;
}

function nodeHandleClassName(connected: boolean) {
  return `node-port-handle${connected ? ' node-port-handle-connected' : ''}`;
}

function nodeHandleLabel(handleId: string, direction: 'input' | 'output', connected: boolean) {
  return `${handleId} ${direction} port, ${connected ? 'connected' : 'disconnected'}`;
}

function nodeFrameLabel({
  name,
  label,
  selected,
  outputPath,
  muted,
  locked,
}: {
  name: string;
  label: string;
  selected: boolean;
  outputPath: boolean;
  muted?: boolean;
  locked?: boolean;
}) {
  const states = [selected && 'selected', outputPath && 'on output path', muted && 'muted', locked && 'locked'].filter(
    Boolean,
  );
  return `${name}, ${label} node${states.length > 0 ? `, ${states.join(', ')}` : ''}`;
}

function handleNodeKeyDown(event: KeyboardEvent<HTMLDivElement>, onSelect: () => void) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect();
}
