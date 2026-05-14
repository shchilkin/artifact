import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import { ADD_GROUPS, ADD_ITEMS, KIND_COLOR } from '../constants';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';
import type { AddAction, PaneMenuProps } from '../types';

const MENU_W = 240;

export function NodeAddMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const mobileSheet = typeof window !== 'undefined' && window.innerWidth <= 640;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const groups = useMemo(() => ADD_GROUPS.map((g) => ({ ...g, items: ADD_ITEMS.filter((i) => i.group === g.id) })), []);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return ADD_ITEMS.filter((i) => i.label.toLowerCase().includes(q) || i.description.toLowerCase().includes(q)).map(
      (i) => ({ ...i, groupLabel: ADD_GROUPS.find((g) => g.id === i.group)?.label ?? '' }),
    );
  }, [query]);

  const isSearching = !!query.trim();
  const firstResult = searchResults[0];

  const position = useMemo(() => clampPopupPosition(x, y, MENU_W, 400), [x, y]);

  const handleAdd = (action: AddAction) => {
    onAdd(action);
    onClose();
  };

  return (
    <NoPan
      ref={menuRef}
      className={`nadd-surface${mobileSheet ? ' nadd-mobile' : ''}`}
      style={
        {
          left: mobileSheet ? 8 : position.left,
          right: mobileSheet ? 8 : undefined,
          top: mobileSheet ? undefined : position.top,
          bottom: mobileSheet ? 'calc(env(safe-area-inset-bottom, 0px) + 8px)' : undefined,
          width: mobileSheet ? 'auto' : MENU_W,
        } as CSSProperties
      }
      onWheelCapture={(e) => e.stopPropagation()}
    >
      {/* Search row */}
      <div className="nadd-search">
        <span className="nadd-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="nadd-search-input"
          aria-label="Search nodes and effects"
          placeholder="Add node…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query) setQuery('');
              else onClose();
            }
            if (e.key === 'Enter' && firstResult) handleAdd(firstResult.action);
          }}
        />
        {query && (
          <NoPan
            as="button"
            type="button"
            className="nadd-search-clear"
            onClick={() => setQuery('')}
            aria-label="Clear"
          >
            ×
          </NoPan>
        )}
      </div>

      {/* Flat list with section headers or search results */}
      <div className="nadd-list nadd-flat-list" onWheelCapture={(e) => e.stopPropagation()}>
        {isSearching ? (
          searchResults.length === 0 ? (
            <div className="nadd-empty">No matches</div>
          ) : (
            searchResults.map((item) => (
              <AddRow
                key={`${item.group}-${item.label}`}
                symbol={item.symbol}
                label={item.label}
                tag={item.groupLabel}
                action={item.action}
                onAdd={handleAdd}
              />
            ))
          )
        ) : (
          groups.map((group) => (
            <div key={group.id} className="nadd-section">
              <div className="nadd-section-header">{group.label}</div>
              {group.items.map((item) => (
                <AddRow
                  key={item.label}
                  symbol={item.symbol}
                  label={item.label}
                  action={item.action}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          ))
        )}
      </div>
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
    <NoPan as="button" type="button" className="nadd-row" onClick={() => onAdd(action)}>
      <span className="nadd-row-symbol" style={{ color: itemColor(action) }}>
        {symbol}
      </span>
      <span className="nadd-row-label">{label}</span>
      {tag && <span className="nadd-row-tag">{tag}</span>}
    </NoPan>
  );
}

function itemColor(action: AddAction) {
  return KIND_COLOR[
    action.kind === 'layer'
      ? action.layerKind
      : action.kind === 'effect'
        ? 'effect'
        : action.kind === 'noisePreset'
          ? 'noise'
          : action.kind === 'arrayPreset'
            ? 'array'
            : action.kind
  ];
}
