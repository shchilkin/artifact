import type { CSSProperties } from 'react';

import { KIND_COLOR, NODE_EDITOR_W } from '../constants';
import type { NodeEditorPanelProps } from '../types';
import { NoPan } from './NoPan';

export function NodeEditorPanel({
  kind,
  title,
  subtitle,
  onClose,
  style,
  children,
}: NodeEditorPanelProps) {
  const accent = KIND_COLOR[kind] ?? 'var(--accent)';

  return (
    <NoPan
      className="node-editor-panel"
      style={{ '--node-accent': accent, width: `var(--node-editor-width, ${NODE_EDITOR_W}px)`, ...style } as CSSProperties}
    >
      <div className="node-editor-accent" />
      <div className="node-editor-header">
        <div className="node-editor-heading">
          <span className="node-editor-title">
            {title}
          </span>
          {subtitle && (
            <span className="node-editor-subtitle">
              {subtitle}
            </span>
          )}
        </div>
        <NoPan
          as="button"
          type="button"
          className="node-shell-action node-editor-close"
          aria-label="Close settings"
          onClick={onClose}
        >
          ×
        </NoPan>
      </div>
      <div className="node-editor-body">
        {children}
      </div>
    </NoPan>
  );
}
