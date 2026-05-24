import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { AddLibraryPreview } from './AddLibraryPreview';
import {
  ADD_LIBRARY_ACTION_MIME,
  ADD_LIBRARY_GROUPS,
  type AddLibraryAction,
  type AddLibraryItem,
  type AddLibrarySurface,
  addLibraryItemsForSurface,
  addLibraryRecipesForSurface,
  serializeAddLibraryAction,
} from './addLibraryModel';

const RECENT_LIMIT = 6;

export function AddLibraryPanel({
  surface,
  searchLabel,
  placeholder,
  onAdd,
  onClose,
  draggable = false,
}: {
  surface: AddLibrarySurface;
  searchLabel: string;
  placeholder: string;
  onAdd: (action: AddLibraryAction) => void;
  onClose: () => void;
  draggable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecent(surface));
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => addLibraryItemsForSurface(surface), [surface]);
  const recipes = useMemo(() => addLibraryRecipesForSurface(surface), [surface]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const activeRecipe = recipes.find((recipe) => recipe.id === activeRecipeId) ?? null;
  const isSearching = !!query.trim();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const searchResults = useMemo(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    return items
      .map((item) => ({ item, score: itemSearchScore(item, tokens) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .map(({ item }) => item);
  }, [items, query]);

  const recipeItems = useMemo(() => {
    if (!activeRecipe) return [];
    return activeRecipe.itemIds.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item));
  }, [activeRecipe, itemById]);

  const sections = useMemo(() => {
    if (isSearching) {
      return [{ id: 'search', label: 'Search', hint: `${searchResults.length} matches`, items: searchResults }];
    }
    if (activeRecipe) {
      return [{ id: activeRecipe.id, label: activeRecipe.label, hint: activeRecipe.hint, items: recipeItems }];
    }

    const recentItems = recentIds.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item));
    const popularItems = items.filter((item) => item.popular && !recentIds.includes(item.id));
    const grouped = ADD_LIBRARY_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      hint: group.hint,
      items: items.filter((item) => item.group === group.id && !recentIds.includes(item.id) && !item.popular),
    })).filter((section) => section.items.length > 0);

    return [
      ...(recentItems.length > 0 ? [{ id: 'recent', label: 'Recent', hint: 'Last used', items: recentItems }] : []),
      ...(popularItems.length > 0
        ? [{ id: 'popular', label: 'Popular', hint: 'Fast starts', items: popularItems }]
        : []),
      ...grouped,
    ];
  }, [activeRecipe, isSearching, itemById, items, recentIds, recipeItems, searchResults]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = flatItems[Math.min(activeIndex, Math.max(0, flatItems.length - 1))] ?? null;

  const handleAdd = (item: AddLibraryItem) => {
    const nextRecentIds = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, RECENT_LIMIT);
    setRecentIds(nextRecentIds);
    writeRecent(surface, nextRecentIds);
    onAdd(item.action);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (query || activeRecipeId) {
        setQuery('');
        setActiveRecipeId(null);
        setActiveIndex(0);
      } else {
        onClose();
      }
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(flatItems.length - 1, index + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
    }
    if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      handleAdd(activeItem);
    }
  };

  return (
    <>
      <div className="add-library-search nadd-search">
        <span className="add-library-search-icon nadd-search-icon">⌕</span>
        <input
          ref={inputRef}
          className="add-library-search-input nadd-search-input"
          aria-label={searchLabel}
          placeholder={placeholder}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveRecipeId(null);
            setActiveIndex(0);
          }}
          onKeyDown={handleKeyDown}
        />
        {query && (
          <button
            type="button"
            className="add-library-search-clear nadd-search-clear"
            onClick={() => {
              setQuery('');
              setActiveIndex(0);
            }}
            aria-label="Clear"
          >
            ×
          </button>
        )}
      </div>

      {recipes.length > 0 && (
        <div className="add-library-recipes nadd-recipes" aria-label="Recipe node groups">
          {recipes.map((recipe) => (
            <button
              key={recipe.id}
              type="button"
              className={`add-library-recipe nadd-recipe${activeRecipeId === recipe.id ? ' add-library-recipe-active nadd-recipe-active' : ''}`}
              title={recipe.hint}
              aria-pressed={activeRecipeId === recipe.id}
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                setActiveRecipeId((current) => (current === recipe.id ? null : recipe.id));
              }}
            >
              {recipe.label}
            </button>
          ))}
        </div>
      )}

      <div className="add-library-body">
        <div className="add-library-list nadd-list nadd-flat-list" onWheelCapture={(event) => event.stopPropagation()}>
          {sections.length === 0 || flatItems.length === 0 ? (
            <div className="add-library-empty nadd-empty">No matches</div>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="add-library-section nadd-section">
                <div className="add-library-section-header nadd-section-header">
                  <span>{section.label}</span>
                  <small>{section.hint}</small>
                </div>
                {section.items.map((item) => {
                  const itemIndex = flatItems.findIndex((entry) => entry.id === item.id);
                  return (
                    <AddLibraryRow
                      key={`${section.id}-${item.id}`}
                      item={item}
                      active={itemIndex === activeIndex}
                      draggable={draggable}
                      onPointerEnter={() => setActiveIndex(itemIndex)}
                      onAdd={handleAdd}
                    />
                  );
                })}
              </div>
            ))
          )}
        </div>
        <AddLibraryDetail item={activeItem} />
      </div>
    </>
  );
}

function AddLibraryDetail({ item }: { item: AddLibraryItem | null }) {
  const group = item ? ADD_LIBRARY_GROUPS.find((entry) => entry.id === item.group) : null;
  return (
    <aside className="add-library-detail" aria-hidden={!item}>
      {item ? (
        <>
          <AddLibraryPreview item={item} />
          <div className="add-library-detail-copy">
            <span className="add-library-detail-kicker">{group?.label ?? 'Add'}</span>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </div>
        </>
      ) : (
        <div className="add-library-detail-empty">Search or choose an item</div>
      )}
    </aside>
  );
}

function AddLibraryRow({
  item,
  active,
  draggable,
  onPointerEnter,
  onAdd,
}: {
  item: AddLibraryItem;
  active: boolean;
  draggable: boolean;
  onPointerEnter: () => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  const group = ADD_LIBRARY_GROUPS.find((entry) => entry.id === item.group);
  return (
    <button
      type="button"
      className={`add-library-row nadd-row${active ? ' add-library-row-active' : ''}`}
      draggable={draggable}
      onPointerEnter={onPointerEnter}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(ADD_LIBRARY_ACTION_MIME, serializeAddLibraryAction(item.action));
        event.dataTransfer.setData('text/plain', item.label);
      }}
      onClick={() => onAdd(item)}
    >
      <span className="add-library-row-symbol nadd-row-symbol" data-add-kind={item.group}>
        {item.symbol}
      </span>
      <span className="add-library-row-copy nadd-row-copy">
        <span className="add-library-row-label nadd-row-label">{item.label}</span>
        <span className="add-library-row-desc nadd-row-desc">{item.description}</span>
      </span>
      {group && <span className="add-library-row-tag nadd-row-tag">{group.label}</span>}
    </button>
  );
}

function itemSearchScore(item: AddLibraryItem, tokens: string[]) {
  const label = item.label.toLowerCase();
  const text = [item.label, item.description, item.symbol, item.group, item.id, item.keywords]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return tokens.reduce((score, token) => {
    if (!text.includes(token)) return score;
    return score + (label.startsWith(token) ? 3 : label.includes(token) ? 2 : 1);
  }, 0);
}

function recentKey(surface: AddLibrarySurface) {
  return `artifact:add-library:${surface}:recent`;
}

function readRecent(surface: AddLibrarySurface): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(recentKey(surface)) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(surface: AddLibrarySurface, ids: string[]) {
  try {
    window.localStorage.setItem(recentKey(surface), JSON.stringify(ids));
  } catch {
    // Recent items are a convenience only; adding the layer/node should never depend on storage.
  }
}
