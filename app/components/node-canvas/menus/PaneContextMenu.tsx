import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ADD_GROUPS, ADD_ITEMS, KIND_COLOR } from '../constants';
import { clampPopupPosition } from '../helpers';
import type { PaneMenuProps } from '../types';
import { NoPan } from '../nodes/NoPan';

export function PaneContextMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const [activeGroup, setActiveGroup] = useState<(typeof ADD_GROUPS)[number]['id']>('content');
  const inputRef = useRef<HTMLInputElement>(null);
  const mobileSheet = typeof window !== 'undefined' && window.innerWidth <= 640;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 720;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const activeGroupData = ADD_GROUPS.find((group) => group.id === activeGroup) ?? ADD_GROUPS[0];

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return ADD_ITEMS.filter((item) => item.group === activeGroup);
    return ADD_ITEMS.filter((item) => {
      const group = ADD_GROUPS.find((entry) => entry.id === item.group);
      return (
        item.label.toLowerCase().includes(q)
        || item.description.toLowerCase().includes(q)
        || item.group.includes(q)
        || group?.label.toLowerCase().includes(q)
        || group?.hint.toLowerCase().includes(q)
      );
    });
  }, [activeGroup, query]);

  const menuWidth = 296;
  const maxMenuHeight = mobileSheet ? Math.min(560, viewportHeight - 16) : Math.min(456, viewportHeight - 24);
  const menuHeight = Math.min(
    maxMenuHeight,
    (query ? 212 : 270) + filtered.length * 58,
  );
  const position = useMemo(
    () => clampPopupPosition(x, y, menuWidth, menuHeight),
    [menuHeight, menuWidth, x, y],
  );

  return (
      <NoPan
        ref={menuRef}
        className={`node-add-menu-surface${mobileSheet ? ' node-add-menu-mobile' : ''}`}
        style={{
          left: mobileSheet ? 8 : position.left,
          right: mobileSheet ? 8 : undefined,
          top: mobileSheet ? undefined : position.top,
          bottom: mobileSheet ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : undefined,
          width: mobileSheet ? 'auto' : menuWidth,
          height: menuHeight,
        } as CSSProperties}
        onWheelCapture={(event) => event.stopPropagation()}
      >
        <div className="node-add-menu-header">
          <div className="node-add-menu-eyebrow">{query ? 'Search results' : 'Add node'}</div>
          <div className="node-add-menu-title">{query ? 'Matching nodes' : activeGroupData.label}</div>
          <p className="node-add-menu-description">
            {query
              ? 'Search across every node type, then press Enter to add the first match.'
              : activeGroupData.description}
          </p>
        </div>
        <div className="node-add-menu-search">
          <div className="node-add-menu-search-shell">
            <span className="node-add-menu-search-icon">⌕</span>
            <input
              ref={inputRef}
              className="node-add-menu-search-input"
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
              placeholder="Search nodes"
            />
          </div>
        </div>
        <div className="node-add-menu-groups" role="tablist" aria-label="Node groups">
          {ADD_GROUPS.map((group) => {
            const count = ADD_ITEMS.filter((item) => item.group === group.id).length;
            return (
              <NoPan
                key={group.id}
                as="button"
                type="button"
                className={`node-add-menu-group-button${activeGroup === group.id ? ' node-add-menu-group-button-active' : ''}`}
                onClick={() => setActiveGroup(group.id)}
                role="tab"
                aria-selected={activeGroup === group.id}
              >
                <span className="node-add-menu-group-label">{group.label}</span>
                <span className="node-add-menu-group-meta">{group.hint} · {count}</span>
              </NoPan>
            );
          })}
        </div>

        <div
          className="node-add-menu-body"
          onWheelCapture={(event) => event.stopPropagation()}
        >
          {filtered.length === 0 && (
            <div className="node-add-menu-empty">
              No results
            </div>
          )}
          {query && filtered.length > 0 && (
            <div className="node-add-menu-group-caption">
              Matching nodes
            </div>
          )}
          {filtered.length > 0 && (
            <div className="node-add-menu-list">
              {filtered.map((item) => (
                <div key={`${item.group}-${item.label}`}>
                  <NoPan
                    as="button"
                    type="button"
                    onClick={() => { onAdd(item.action); onClose(); }}
                    className="node-add-menu-item"
                  >
                    <span className="node-add-menu-item-symbol" style={{ color: KIND_COLOR[item.action.kind === 'layer' ? item.action.layerKind : item.action.kind] }}>
                      {item.symbol}
                    </span>
                    <span className="node-add-menu-item-copy">
                      <span className="node-add-menu-item-label">
                        {item.label}
                      </span>
                      <span className="node-add-menu-item-description">
                        {item.description}
                      </span>
                    </span>
                    {query && (
                      <span className="node-add-menu-item-tag">
                        {ADD_GROUPS.find((group) => group.id === item.group)?.label ?? item.group}
                      </span>
                    )}
                  </NoPan>
                </div>
              ))}
            </div>
          )}
        </div>
      </NoPan>
  );
}
