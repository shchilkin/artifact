import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ADD_ITEMS, KIND_COLOR } from '../constants';
import { clampPopupPosition } from '../helpers';
import type { PaneMenuProps } from '../types';
import { NoPan } from '../nodes/NoPan';

export function PaneContextMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const menuWidth = 220;
  const menuHeight = Math.min(368, 64 + groupsHeightEstimate(query));

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ADD_ITEMS;
    return ADD_ITEMS.filter((item) => item.label.toLowerCase().includes(q) || item.group.includes(q));
  }, [query]);

  const groups = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{ header: string | null; item: typeof ADD_ITEMS[number] }> = [];
    for (const item of filtered) {
      if (!seen.has(item.group)) {
        seen.add(item.group);
        result.push({ header: item.group, item });
      } else {
        result.push({ header: null, item });
      }
    }
    return result;
  }, [filtered]);

  const position = useMemo(
    () => clampPopupPosition(x, y, menuWidth, menuHeight),
    [menuHeight, menuWidth, x, y],
  );

  return (
    <NoPan
      ref={menuRef}
      className="node-menu"
      style={{ left: position.left, top: position.top, width: menuWidth } as CSSProperties}
    >
      <div className="node-menu-search">
        <span className="node-menu-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="node-menu-search-input"
          aria-label="Search node types"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'Enter' && filtered.length > 0) {
              onAdd(filtered[0].action);
              onClose();
            }
          }}
          placeholder="Add node…"
        />
      </div>

      <div className="node-menu-list">
        {groups.length === 0 && (
          <div className="node-menu-empty">
            No results
          </div>
        )}
        {groups.map(({ header, item }, i) => (
          <div key={i}>
            {header && !query && (
              <div className="node-menu-group">
                {header}
              </div>
            )}
            <NoPan
              as="button"
              type="button"
              onClick={() => { onAdd(item.action); onClose(); }}
              className="node-menu-item"
            >
              <span className="node-menu-item-symbol" style={{ color: KIND_COLOR[item.action.kind === 'layer' ? item.action.layerKind : item.action.kind] }}>
                {item.symbol}
              </span>
              <span className="node-menu-item-label">
                {item.label}
              </span>
            </NoPan>
          </div>
        ))}
      </div>
    </NoPan>
  );
}

function groupsHeightEstimate(query: string) {
  return query ? 260 : 320;
}
