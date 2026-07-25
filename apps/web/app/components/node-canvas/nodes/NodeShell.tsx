import type { CSSProperties } from 'react';

import { KIND_COLOR, KIND_SYMBOL, NODE_W } from '../constants';
import type { NodeShellProps } from '../types';
import { NoPan } from './NoPan';

export function NodeShell({
  kind,
  label,
  name,
  selected,
  outputPath,
  muted,
  expanded,
  expandable,
  onToggleExpanded,
  children,
  onToggleMuted,
  onDelete,
  onDragHandlePointerDown,
  deleteDisabled,
}: NodeShellProps) {
  void expanded;
  void expandable;
  void onToggleExpanded;
  void onDelete;
  const accent = KIND_COLOR[kind] ?? 'var(--accent-primary)';
  return (
    <div
      className={nodeShellClassName(kind, { outputPath, selected, muted })}
      data-node-kind={kind}
      data-node-housing-state={nodeHousingState({ outputPath, selected, muted, locked: deleteDisabled })}
      style={{ '--node-accent': accent, '--node-default-width': `${NODE_W}px` } as CSSProperties}
    >
      <div className="node-shell-accent" aria-hidden="true" />
      <div className="node-shell-header">
        <div className="node-drag-handle node-shell-drag" onPointerDown={onDragHandlePointerDown}>
          <span className="node-shell-symbol">{KIND_SYMBOL[kind] ?? '○'}</span>
          <span className="node-shell-label">{label}</span>
          <NodeDisplayName label={label} name={name} />
        </div>
        {(onToggleMuted || deleteDisabled) && (
          <div className="node-shell-actions" role="group" aria-label="Node commands">
            <NodeMuteAction muted={muted} onToggleMuted={onToggleMuted} />
            <NodeLockState locked={deleteDisabled} />
          </div>
        )}
      </div>
      <div className="node-shell-body">{children}</div>
    </div>
  );
}

function nodeShellClassName(
  kind: NodeShellProps['kind'],
  flags: Pick<NodeShellProps, 'outputPath' | 'selected' | 'muted'>,
) {
  return [
    'node-shell',
    `node-shell-kind-${kind}`,
    flags.outputPath && 'node-shell-output-path',
    flags.selected && 'node-shell-selected',
    flags.muted && 'node-shell-muted',
  ]
    .filter(Boolean)
    .join(' ');
}

function nodeHousingState({
  outputPath,
  selected,
  muted,
  locked,
}: Pick<NodeShellProps, 'outputPath' | 'selected' | 'muted'> & { locked?: boolean }) {
  const states = [
    selected ? 'selected' : 'default',
    outputPath && 'output-path',
    muted && 'muted',
    locked && 'locked',
  ].filter(Boolean);
  return states.join(' ');
}

function NodeDisplayName({ label, name }: Pick<NodeShellProps, 'label' | 'name'>) {
  return name.trim().toLowerCase() === label.trim().toLowerCase() ? null : (
    <span className="node-shell-name">{name}</span>
  );
}

function NodeMuteAction({ muted, onToggleMuted }: Pick<NodeShellProps, 'muted' | 'onToggleMuted'>) {
  if (!onToggleMuted) return null;
  const copy = nodeMuteActionCopy(muted);
  return (
    <NoPan
      as="button"
      type="button"
      className="node-shell-action node-shell-mute"
      aria-label={copy.ariaLabel}
      title={copy.title}
      aria-keyshortcuts="M"
      aria-pressed={muted}
      onClick={onToggleMuted}
    >
      <span className="node-shell-mute-dot" aria-hidden="true">
        {copy.dot}
      </span>
      <span className="node-shell-mute-label">{copy.label}</span>
    </NoPan>
  );
}

function NodeLockState({ locked }: { locked?: boolean }) {
  if (!locked) return null;
  return (
    <span className="node-shell-lock-state" title="Locked — deletion unavailable">
      <span aria-hidden="true">⌑</span>
      <span>Locked</span>
    </span>
  );
}

function nodeMuteActionCopy(muted: boolean | undefined) {
  return muted
    ? { ariaLabel: 'Unmute node', title: 'Unmute (M)', dot: '○', label: 'Muted' }
    : { ariaLabel: 'Mute node', title: 'Mute (M)', dot: '●', label: 'Mute' };
}
