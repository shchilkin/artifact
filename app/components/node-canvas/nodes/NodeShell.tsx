import type { CSSProperties } from 'react';

import { KIND_COLOR, KIND_SYMBOL, NODE_W } from '../constants';
import type { NodeShellProps } from '../types';
import { NoPan } from './NoPan';

export function NodeShell({
  kind,
  label,
  name,
  selected,
  expanded,
  expandable,
  onToggleExpanded,
  children,
  onDelete,
}: NodeShellProps) {
  void expanded;
  void expandable;
  void onToggleExpanded;
  const accent = KIND_COLOR[kind] ?? 'var(--accent)';
  return (
    <div
      className={`node-shell${selected ? ' node-shell-selected' : ''}`}
      style={{ '--node-accent': accent, width: `var(--node-width, ${NODE_W}px)` } as CSSProperties}
    >
      <div className="node-shell-accent" aria-hidden="true" />
      <div className="node-shell-header">
        <div className="node-drag-handle node-shell-drag">
          <span className="node-shell-symbol">
            {KIND_SYMBOL[kind] ?? '○'}
          </span>
          <span className="node-shell-label">{label}</span>
          <span className="node-shell-name">{name}</span>
        </div>
        {onDelete && (
          <NoPan
            as="button"
            type="button"
            className="nodrag node-shell-action node-shell-delete"
            aria-label="Delete node"
            onClick={onDelete}
          >×</NoPan>
        )}
      </div>
      <div className="node-shell-body">{children}</div>
    </div>
  );
}
