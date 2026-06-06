import { FloatingMenu } from '../../ui/floating-menu';
import { MenuDivider } from '../../ui/MenuItem';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';
import type { NodeMenuProps } from '../types';

interface NodeMenuItemModel {
  label: string;
  hint?: string;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  dividerBefore?: boolean;
}

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
  const items = buildNodeMenuItems({
    isMerge,
    isExport,
    muted,
    removeFromArea,
    onDuplicate,
    onToggleMuted,
    onRemoveFromArea,
    onDelete,
    deleteDisabled,
  });
  const menuWidth = 232;

  if (items.length === 0) return null;

  const menuHeight = 12 + items.length * 52;
  const position = clampPopupPosition(x, y, menuWidth, menuHeight);

  return (
    <FloatingMenu
      ref={menuRef}
      x={position.left}
      y={position.top}
      className="artifact-menu node-menu"
      style={{ width: menuWidth, padding: '4px 0' }}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      role="menu"
    >
      {items.map((item, i) => (
        <NodeMenuItem key={i} item={item} onClose={onClose} />
      ))}
    </FloatingMenu>
  );
}

function buildNodeMenuItems({
  isMerge,
  isExport,
  muted,
  removeFromArea,
  onDuplicate,
  onToggleMuted,
  onRemoveFromArea,
  onDelete,
  deleteDisabled,
}: Pick<
  NodeMenuProps,
  | 'isMerge'
  | 'isExport'
  | 'muted'
  | 'removeFromArea'
  | 'onDuplicate'
  | 'onToggleMuted'
  | 'onRemoveFromArea'
  | 'onDelete'
  | 'deleteDisabled'
>) {
  if (isExport) return [];
  return [
    duplicateMenuItem(isMerge, onDuplicate),
    muteMenuItem(muted, onToggleMuted),
    removeFromAreaMenuItem(removeFromArea, onRemoveFromArea),
    deleteMenuItem(isMerge, onDelete, deleteDisabled),
  ].filter(Boolean) as NodeMenuItemModel[];
}

function duplicateMenuItem(isMerge: boolean, onDuplicate: () => void): NodeMenuItemModel | null {
  return isMerge ? null : { label: 'Duplicate', hint: '⌘D', action: onDuplicate };
}

function muteMenuItem(muted: boolean | undefined, onToggleMuted?: () => void): NodeMenuItemModel | null {
  return onToggleMuted ? { label: muted ? 'Unmute' : 'Mute', hint: 'M', action: onToggleMuted } : null;
}

function removeFromAreaMenuItem(
  removeFromArea: NodeMenuProps['removeFromArea'],
  onRemoveFromArea: NodeMenuProps['onRemoveFromArea'],
): NodeMenuItemModel | null {
  if (!removeFromArea || !onRemoveFromArea) return null;
  return {
    label: 'Remove from area',
    hint: removeFromArea.areaName,
    action: () => onRemoveFromArea(removeFromArea.areaId, removeFromArea.nodeId),
  };
}

function deleteMenuItem(
  isMerge: boolean,
  onDelete: () => void,
  deleteDisabled: boolean | undefined,
): NodeMenuItemModel {
  return {
    label: 'Delete',
    hint: deleteDisabled ? 'locked' : '⌫',
    action: onDelete,
    danger: true,
    disabled: deleteDisabled,
    dividerBefore: !isMerge,
  };
}

function NodeMenuItem({ item, onClose }: { item: NodeMenuItemModel; onClose: () => void }) {
  return (
    <div>
      {item.dividerBefore && <MenuDivider />}
      <NoPan
        as="button"
        type="button"
        role="menuitem"
        disabled={item.disabled}
        onClick={() => handleNodeMenuItemClick(item, onClose)}
        className={nodeMenuItemClassName(item)}
      >
        <span className="artifact-menu-item-label node-menu-item-label">{item.label}</span>
        {item.hint && <span className="artifact-menu-item-hint node-menu-item-hint">{item.hint}</span>}
      </NoPan>
    </div>
  );
}

function handleNodeMenuItemClick(item: NodeMenuItemModel, onClose: () => void) {
  if (item.disabled) return;
  item.action();
  onClose();
}

function nodeMenuItemClassName(item: NodeMenuItemModel) {
  return [
    'artifact-menu-item',
    'node-menu-item',
    'node-menu-item-between',
    item.danger && 'artifact-menu-item--danger',
    item.disabled && 'node-menu-item-disabled',
  ]
    .filter(Boolean)
    .join(' ');
}
