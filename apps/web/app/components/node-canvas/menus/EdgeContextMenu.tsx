import type { RefObject } from 'react';

import { FloatingMenu } from '../../ui/floating-menu';
import { MenuDivider } from '../../ui/MenuItem';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';

interface EdgeContextMenuProps {
  x: number;
  y: number;
  onInsertNode: () => void;
  onDelete: () => void;
  onClose: () => void;
  menuRef: RefObject<HTMLDivElement | null>;
}

export function EdgeContextMenu({ x, y, onInsertNode, onDelete, onClose, menuRef }: EdgeContextMenuProps) {
  const menuWidth = 232;
  const position = clampPopupPosition(x, y, menuWidth, 116);
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
      <EdgeMenuItem
        label="Insert node"
        hint="+"
        onClick={() => {
          onClose();
          requestAnimationFrame(onInsertNode);
        }}
      />
      <MenuDivider />
      <EdgeMenuItem
        label="Delete connection"
        hint="⌫"
        danger
        onClick={() => {
          onDelete();
          onClose();
        }}
      />
    </FloatingMenu>
  );
}

function EdgeMenuItem({
  label,
  hint,
  danger,
  onClick,
}: {
  label: string;
  hint: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <NoPan
      as="button"
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        'artifact-menu-item',
        'node-menu-item',
        'node-menu-item-between',
        danger && 'artifact-menu-item--danger',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <span className="artifact-menu-item-label node-menu-item-label">{label}</span>
      <span className="artifact-menu-item-hint node-menu-item-hint">{hint}</span>
    </NoPan>
  );
}
