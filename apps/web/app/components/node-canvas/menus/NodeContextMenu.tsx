import { FloatingMenu } from '../../ui/floating-menu';
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
  removeFromArea,
  onDuplicate,
  onToggleMuted,
  onRemoveFromArea,
  onDelete,
  deleteDisabled,
  onClose,
  menuRef,
}: NodeMenuProps) {
  const items: Array<{
    label: string;
    hint?: string;
    action: () => void;
    danger?: boolean;
    disabled?: boolean;
    dividerBefore?: boolean;
  }> = [];
  const menuWidth = 232;

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
  if (onRemoveFromArea && removeFromArea && !isExport) {
    items.push({
      label: 'Remove from area',
      hint: removeFromArea.areaName,
      action: () => onRemoveFromArea(removeFromArea.areaId, removeFromArea.nodeId),
      dividerBefore: items.length > 0,
    });
  }
  if (!isExport) {
    items.push({
      label: 'Delete',
      hint: deleteDisabled ? 'locked' : '⌫',
      action: onDelete,
      danger: true,
      disabled: deleteDisabled,
      dividerBefore: !isMerge && items.length > 0,
    });
  }

  if (items.length === 0) return null;

  const menuHeight = 12 + items.length * 52;
  const position = clampPopupPosition(x, y, menuWidth, menuHeight);

  return (
    <FloatingMenu
      ref={menuRef}
      x={position.left}
      y={position.top}
      className="node-menu"
      style={{ width: menuWidth, padding: '4px 0' }}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role="menu"
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && <div className="node-menu-divider" />}
          <NoPan
            as="button"
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              if (item.disabled) return;
              item.action();
              onClose();
            }}
            className={`node-menu-item node-menu-item-between${item.disabled ? ' node-menu-item-disabled' : ''}`}
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
    </FloatingMenu>
  );
}
