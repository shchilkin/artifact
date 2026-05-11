import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';

import { ADD_GROUPS, ADD_ITEMS, KIND_COLOR } from '../constants';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';
import type { AddAction, PaneMenuProps } from '../types';

type AddGroupId = (typeof ADD_GROUPS)[number]['id'];

export function NodeAddMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<AddGroupId | null>(null);
  const [flyoutLeft, setFlyoutLeft] = useState(true);
  const flyoutRef = useRef<HTMLDivElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mobileSheet = typeof window !== 'undefined' && window.innerWidth <= 640;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLInputElement>('.nadd-search-input')?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [menuRef]);

  // Cleanup leave timer on unmount
  useEffect(() => () => { if (leaveTimer.current) clearTimeout(leaveTimer.current); }, []);

  // Flip flyout to left when it would overflow the right edge
  useEffect(() => {
    if (!flyoutRef.current) return;
    const rect = flyoutRef.current.getBoundingClientRect();
    setFlyoutLeft(rect.right <= window.innerWidth - 8);
  }, [activeGroupId]);

  const cancelLeave = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
  }, []);

  const scheduleLeave = useCallback(() => {
    cancelLeave();
    leaveTimer.current = setTimeout(() => setActiveGroupId(null), 180);
  }, [cancelLeave]);

  const handleGroupEnter = useCallback((id: AddGroupId) => {
    cancelLeave();
    setActiveGroupId(id);
  }, [cancelLeave]);

  const groups = useMemo(
    () => ADD_GROUPS.map((g) => ({ ...g, items: ADD_ITEMS.filter((i) => i.group === g.id) })),
    [],
  );

  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ADD_ITEMS
      .filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q))
      .map((i) => ({ ...i, groupLabel: ADD_GROUPS.find((g) => g.id === i.group)?.label ?? '' }));
  }, [query]);

  const isSearching = !!query.trim();
  const firstResult = searchResults[0];

  // Clamp position using total likely width (column + flyout) so flyout stays in viewport
  const COLUMN_W = 200;
  const FLYOUT_W = 210;
  const position = useMemo(
    () => clampPopupPosition(x, y, COLUMN_W + FLYOUT_W, 320),
    [x, y],
  );

  const handleAdd = (action: AddAction) => {
    onAdd(action);
    onClose();
  };

  return (
    <NoPan
      ref={menuRef}
      className={`nadd-surface${mobileSheet ? ' nadd-mobile' : ''}`}
      style={{
        left: mobileSheet ? 8 : position.left,
        right: mobileSheet ? 8 : undefined,
        top: mobileSheet ? undefined : position.top,
        bottom: mobileSheet ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : undefined,
        width: mobileSheet ? 'auto' : COLUMN_W,
      } as CSSProperties}
      onWheelCapture={(e) => e.stopPropagation()}
      onMouseLeave={() => { if (!isSearching) scheduleLeave(); }}
      onMouseEnter={cancelLeave}
    >
      {/* Search row */}
      <div className="nadd-search">
        <span className="nadd-search-icon">⌕</span>
        <input
          className="nadd-search-input"
          aria-label="Search nodes and effects"
          placeholder="Search…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { if (query) setQuery(''); else onClose(); }
            if (e.key === 'Enter' && firstResult) handleAdd(firstResult.action);
          }}
        />
        {query && (
          <NoPan as="button" type="button" className="nadd-search-clear" onClick={() => setQuery('')} aria-label="Clear">
            ×
          </NoPan>
        )}
      </div>

      {/* Group list or search results */}
      {isSearching ? (
        <div className="nadd-list nadd-results" onWheelCapture={(e) => e.stopPropagation()}>
          {searchResults.length === 0
            ? <div className="nadd-empty">No matches</div>
            : searchResults.map((item) => (
              <AddRow
                key={`${item.group}-${item.label}`}
                symbol={item.symbol}
                label={item.label}
                tag={item.groupLabel}
                action={item.action}
                onAdd={handleAdd}
              />
            ))}
        </div>
      ) : (
        <div className="nadd-groups" role="menu">
          {groups.map((group) => (
            <NoPan
              key={group.id}
              as="button"
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={activeGroupId === group.id}
              className={`nadd-group${activeGroupId === group.id ? ' nadd-group-active' : ''}`}
              onMouseEnter={() => handleGroupEnter(group.id)}
              onFocus={() => handleGroupEnter(group.id)}
              onClick={() => {
                if (mobileSheet) setActiveGroupId(activeGroupId === group.id ? null : group.id);
              }}
            >
              <span className="nadd-group-label">{group.label}</span>
              <span className="nadd-group-hint">{group.hint}</span>
              <span className="nadd-group-arrow">›</span>
            </NoPan>
          ))}
        </div>
      )}

      {/* Desktop flyout */}
      {!isSearching && activeGroup && !mobileSheet && (
        <div
          ref={flyoutRef}
          className={`nadd-flyout${flyoutLeft ? '' : ' nadd-flyout-flip'}`}
          onWheelCapture={(e) => e.stopPropagation()}
          onMouseEnter={cancelLeave}
        >
          <div className="nadd-flyout-heading">{activeGroup.label}</div>
          <div className="nadd-list">
            {activeGroup.items.map((item) => (
              <AddRow
                key={item.label}
                symbol={item.symbol}
                label={item.label}
                action={item.action}
                onAdd={handleAdd}
              />
            ))}
          </div>
        </div>
      )}

      {/* Mobile inline expansion */}
      {!isSearching && activeGroup && mobileSheet && (
        <div className="nadd-list nadd-inline-items" onWheelCapture={(e) => e.stopPropagation()}>
          {activeGroup.items.map((item) => (
            <AddRow
              key={item.label}
              symbol={item.symbol}
              label={item.label}
              action={item.action}
              onAdd={handleAdd}
            />
          ))}
        </div>
      )}
    </NoPan>
  );
}

function AddRow({
  symbol,
  label,
  tag,
  action,
  onAdd,
}: {
  symbol: string;
  label: string;
  tag?: string;
  action: AddAction;
  onAdd: (a: AddAction) => void;
}) {
  return (
    <NoPan
      as="button"
      type="button"
      className="nadd-row"
      onClick={() => onAdd(action)}
    >
      <span className="nadd-row-symbol" style={{ color: itemColor(action) }}>{symbol}</span>
      <span className="nadd-row-label">{label}</span>
      {tag && <span className="nadd-row-tag">{tag}</span>}
    </NoPan>
  );
}

function itemColor(action: AddAction) {
  return KIND_COLOR[action.kind === 'layer' ? action.layerKind : action.kind === 'effect' ? 'effect' : action.kind];
}
