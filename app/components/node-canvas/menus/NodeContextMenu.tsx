import type { CSSProperties } from 'react';

import { NoPan } from '../nodes/NoPan';
import type { NodeMenuProps } from '../types';

export function NodeContextMenu({ x, y, isMerge, isExport, onDuplicate, onDelete, onClose, menuRef }: NodeMenuProps) {
  const items: Array<{ label: string; hint?: string; action: () => void; danger?: boolean; dividerBefore?: boolean }> = [];

  if (!isMerge && !isExport) {
    items.push({ label: 'Duplicate', hint: '⌘D', action: onDuplicate });
  }
  if (!isExport) {
    items.push({ label: 'Delete', hint: '⌫', action: onDelete, danger: true, dividerBefore: !isMerge && items.length > 0 });
  }

  if (items.length === 0) return null;

  return (
    <NoPan
      ref={menuRef}
      className="node-menu"
      style={{ left: x, top: y, width: 200, padding: '4px 0' } as CSSProperties}
    >
      {items.map((item, i) => (
        <div key={i}>
          {item.dividerBefore && (
            <div className="node-menu-divider" />
          )}
          <NoPan
            as="button"
            type="button"
            onClick={() => { item.action(); onClose(); }}
            className="node-menu-item node-menu-item-between"
          >
            <span className={`node-menu-item-label${item.danger ? ' node-menu-item-danger' : ''}`}>
              {item.label}
            </span>
            {item.hint && (
              <span className="node-menu-item-hint">
                {item.hint}
              </span>
            )}
          </NoPan>
        </div>
      ))}
    </NoPan>
  );
}
