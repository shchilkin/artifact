import type { CSSProperties } from 'react';

import { NODE_CANVAS_COLORS } from '../constants';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';
import type { NodeMenuProps } from '../types';

export function NodeContextMenu({
  x,
  y,
  isMerge,
  isExport,
  muted,
  onDuplicate,
  onToggleMuted,
  onDelete,
  onClose,
  menuRef,
}: NodeMenuProps) {
  const items: Array<{ label: string; hint?: string; action: () => void; danger?: boolean; dividerBefore?: boolean }> =
    [];
  const menuWidth = 200;

  if (!isMerge && !isExport) {
    items.push({ label: 'Duplicate', hint: '⌘D', action: onDuplicate });
  }
  if (onToggleMuted && !isExport) {
    items.push({
      label: muted ? 'Unmute' : 'Mute',
      hint: 'M',
      action: onToggleMuted,
      dividerBefore: items.length > 0,
    });
  }
  if (!isExport) {
    items.push({
      label: 'Delete',
      hint: '⌫',
      action: onDelete,
      danger: true,
      dividerBefore: !isMerge && items.length > 0,
    });
  }

  if (items.length === 0) return null;

  const menuHeight = 12 + items.length * 52;
  const position = clampPopupPosition(x, y, menuWidth, menuHeight);

  return (
    <NoPan
      ref={menuRef}
      className="node-menu"
      style={{ left: position.left, top: position.top, width: menuWidth, padding: '4px 0' } as CSSProperties}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && <div className="node-menu-divider" />}
          <NoPan
            as="button"
            type="button"
            onClick={() => {
              item.action();
              onClose();
            }}
            className="node-menu-item node-menu-item-between"
          >
            <span
              className={`node-menu-item-label${item.danger ? ' node-menu-item-danger' : ''}`}
              style={item.danger ? { color: NODE_CANVAS_COLORS.danger } : undefined}
            >
              {item.label}
            </span>
            {item.hint && <span className="node-menu-item-hint">{item.hint}</span>}
          </NoPan>
        </div>
      ))}
    </NoPan>
  );
}
