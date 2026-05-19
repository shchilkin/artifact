import type { CSSProperties } from 'react';

import { KIND_COLOR, KIND_SYMBOL, NODE_W } from '../constants';
import type { NodeShellProps } from '../types';
import { NoPan } from './NoPan';

export function NodeShell({
  kind,
  label,
  name,
  selected,
  muted,
  expanded,
  expandable,
  onToggleExpanded,
  children,
  onToggleMuted,
  onDelete,
}: NodeShellProps) {
  void expanded;
  void expandable;
  void onToggleExpanded;
  const accent = KIND_COLOR[kind] ?? 'var(--accent)';
  const showName = name.trim().toLowerCase() !== label.trim().toLowerCase();
  return (
    <div
      className={`node-shell node-shell-kind-${kind}${selected ? ' node-shell-selected' : ''}${muted ? ' node-shell-muted' : ''}`}
      style={{ '--node-accent': accent, '--node-default-width': `${NODE_W}px` } as CSSProperties}
    >
      <div className="node-shell-accent" aria-hidden="true" />
      <div className="node-shell-header">
        <div className="node-drag-handle node-shell-drag">
          <span className="node-shell-symbol">{KIND_SYMBOL[kind] ?? '○'}</span>
          <span className="node-shell-label">{label}</span>
          {showName && <span className="node-shell-name">{name}</span>}
        </div>
        {onToggleMuted && (
          <NoPan
            as="button"
            type="button"
            className="nodrag node-shell-action node-shell-mute"
            aria-label={muted ? 'Unmute node' : 'Mute node'}
            title={muted ? 'Unmute (M)' : 'Mute (M)'}
            aria-keyshortcuts="M"
            aria-pressed={muted}
            onClick={onToggleMuted}
          >
            <span className="node-shell-mute-dot" aria-hidden="true">
              {muted ? '○' : '●'}
            </span>
            <span className="node-shell-mute-label">{muted ? 'Muted' : 'Mute'}</span>
          </NoPan>
        )}
        {onDelete && (
          <NoPan
            as="button"
            type="button"
            className="nodrag node-shell-action node-shell-delete"
            aria-label="Delete node"
            onClick={onDelete}
          >
            ×
          </NoPan>
        )}
      </div>
      <div className="node-shell-body">{children}</div>
    </div>
  );
}
