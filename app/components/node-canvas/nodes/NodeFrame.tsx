import type { KeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode, WheelEventHandler } from 'react';
import { Handle, Position } from '@xyflow/react';

import { HANDLE_STYLE } from '../constants';
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
  editing: boolean;
  targetHandles: NodeHandleConfig[];
  sourceHandles?: NodeHandleConfig[];
  onSelect: (event?: ReactMouseEvent<HTMLDivElement>) => void;
  onDelete?: () => void;
  className?: string;
  onWheelCapture?: WheelEventHandler<HTMLDivElement>;
  children: ReactNode;
}

export function NodeFrame({
  id,
  kind,
  label,
  name,
  selected,
  editing,
  targetHandles,
  sourceHandles = [{ id: 'out' }],
  onSelect,
  onDelete,
  className,
  onWheelCapture,
  children,
}: NodeFrameProps) {
  return (
    <div
      data-node-id={id}
      style={{ position: 'relative', zIndex: editing ? 4 : 1 }}
      className={className}
      onWheelCapture={onWheelCapture}
    >
      {targetHandles.map((handle) => (
        <Handle
          key={`target:${handle.id}`}
          type="target"
          position={Position.Left}
          id={handle.id}
          style={handle.top ? { ...HANDLE_STYLE, top: handle.top } : HANDLE_STYLE}
        />
      ))}
      <div
        className="node-shell-frame"
        tabIndex={0}
        role="group"
        aria-roledescription="canvas node"
        aria-label={`${name}, ${label} node${selected ? ', selected' : ''}`}
        onClick={(event) => onSelect(event)}
        onFocus={() => onSelect()}
        onKeyDown={(event) => handleNodeKeyDown(event, () => onSelect())}
      >
        <NodeShell
          kind={kind}
          label={label}
          name={name}
          selected={selected}
          expanded={editing}
          expandable
          onDelete={onDelete}
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
          style={handle.top ? { ...HANDLE_STYLE, top: handle.top } : HANDLE_STYLE}
        />
      ))}
    </div>
  );
}

function handleNodeKeyDown(
  event: KeyboardEvent<HTMLDivElement>,
  onSelect: () => void,
) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  onSelect();
}
