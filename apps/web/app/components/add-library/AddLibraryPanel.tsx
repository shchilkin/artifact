import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { ActionButton } from '../ui/ActionButton';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { SearchField } from '../ui/SearchField';
import { ToolbarButton } from '../ui/Toolbar';
import { AddLibraryPreview } from './AddLibraryPreview';
import {
  ADD_LIBRARY_ACTION_MIME,
  ADD_LIBRARY_GROUPS,
  type AddLibraryAction,
  type AddLibraryGroupId,
  type AddLibraryItem,
  type AddLibrarySurface,
  addLibraryBrowseItemsForSurface,
  addLibraryGroupsForSurface,
  addLibraryItemsForSurface,
  addLibraryRecipesForSurface,
  searchAddLibraryItems,
  serializeAddLibraryAction,
} from './addLibraryModel';

const RECENT_LIMIT = 6;
const FAVORITE_LIMIT = 12;

export function AddLibraryPanel({
  surface,
  searchLabel,
  placeholder,
  onAdd,
  onClose,
  autoFocusSearch = true,
  draggable = false,
}: {
  surface: AddLibrarySurface;
  searchLabel: string;
  placeholder: string;
  onAdd: (action: AddLibraryAction) => void;
  onClose: () => void;
  autoFocusSearch?: boolean;
  draggable?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<AddLibraryGroupId | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => readRecent(surface));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readFavorites(surface));
  const inputRef = useRef<HTMLInputElement>(null);

  const items = useMemo(() => addLibraryItemsForSurface(surface), [surface]);
  const browsableItems = useMemo(() => addLibraryBrowseItemsForSurface(surface), [surface]);
  const recipes = useMemo(() => addLibraryRecipesForSurface(surface), [surface]);
  const groups = useMemo(() => addLibraryGroupsForSurface(surface), [surface]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const activeRecipe = recipes.find((recipe) => recipe.id === activeRecipeId) ?? null;
  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? null;
  const scopedItems = activeGroupId ? items.filter((item) => item.group === activeGroupId) : items;
  const browsableScopedItems = useMemo(
    () => (activeGroupId ? browsableItems.filter((item) => item.group === activeGroupId) : browsableItems),
    [activeGroupId, browsableItems],
  );
  const isSearching = !!query.trim();

  useEffect(() => {
    if (!autoFocusSearch) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusSearch]);

  const searchResults = useMemo(() => {
    return searchAddLibraryItems(scopedItems, query);
  }, [query, scopedItems]);

  const recipeItems = useMemo(() => {
    if (!activeRecipe) return [];
    return activeRecipe.itemIds.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item));
  }, [activeRecipe, itemById]);

  const sections = useMemo(() => {
    if (isSearching) {
      return [
        {
          id: 'search',
          label: activeGroup ? `${activeGroup.label} Search` : 'Search',
          hint: `${searchResults.length} matches`,
          items: searchResults,
        },
      ];
    }
    if (activeRecipe) {
      return [{ id: activeRecipe.id, label: activeRecipe.label, hint: activeRecipe.hint, items: recipeItems }];
    }
    if (activeGroup) {
      return [{ id: activeGroup.id, label: activeGroup.label, hint: activeGroup.hint, items: browsableScopedItems }];
    }

    const favoriteItems = favoriteIds
      .map((id) => itemById.get(id))
      .filter((item): item is AddLibraryItem => Boolean(item));
    const recentItems = recentIds.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item));
    const pinnedIds = new Set([...favoriteIds, ...recentIds]);
    const popularItems = browsableItems.filter((item) => item.popular && !pinnedIds.has(item.id));
    const grouped = ADD_LIBRARY_GROUPS.map((group) => ({
      id: group.id,
      label: group.label,
      hint: group.hint,
      items: browsableItems.filter((item) => item.group === group.id && !pinnedIds.has(item.id) && !item.popular),
    })).filter((section) => section.items.length > 0);

    return [
      ...(favoriteItems.length > 0
        ? [{ id: 'favorites', label: 'Favorites', hint: 'Pinned locally', items: favoriteItems }]
        : []),
      ...(recentItems.length > 0 ? [{ id: 'recent', label: 'Recent', hint: 'Last used', items: recentItems }] : []),
      ...(popularItems.length > 0
        ? [{ id: 'popular', label: 'Popular', hint: 'Fast starts', items: popularItems }]
        : []),
      ...grouped,
    ];
  }, [
    activeGroup,
    activeRecipe,
    browsableItems,
    browsableScopedItems,
    favoriteIds,
    isSearching,
    itemById,
    recentIds,
    recipeItems,
    searchResults,
  ]);

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = flatItems[Math.min(activeIndex, Math.max(0, flatItems.length - 1))] ?? null;

  const handleAdd = (item: AddLibraryItem) => {
    const nextRecentIds = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, RECENT_LIMIT);
    setRecentIds(nextRecentIds);
    writeRecent(surface, nextRecentIds);
    onAdd(item.action);
  };

  const handleToggleFavorite = (item: AddLibraryItem) => {
    const nextFavoriteIds = favoriteIds.includes(item.id)
      ? favoriteIds.filter((id) => id !== item.id)
      : [item.id, ...favoriteIds].slice(0, FAVORITE_LIMIT);
    setFavoriteIds(nextFavoriteIds);
    writeFavorites(surface, nextFavoriteIds);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (query || activeRecipeId || activeGroupId) {
        setQuery('');
        setActiveRecipeId(null);
        setActiveGroupId(null);
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
    if (event.key === 'Home') {
      event.preventDefault();
      setActiveIndex(0);
    }
    if (event.key === 'End') {
      event.preventDefault();
      setActiveIndex(Math.max(0, flatItems.length - 1));
    }
  };

  return (
    <>
      <SearchField
        ref={inputRef}
        className="add-library-search nadd-search"
        clearClassName="add-library-search-clear nadd-search-clear"
        inputClassName="add-library-search-input nadd-search-input"
        aria-label={searchLabel}
        placeholder={placeholder}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActiveRecipeId(null);
          setActiveIndex(0);
        }}
        onClear={() => {
          setQuery('');
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />

      <div className="add-library-browse nadd-browse" aria-label="Browse library groups">
        <ToolbarButton
          type="button"
          className={`add-library-browse-item nadd-browse-item${activeGroupId === null ? ' add-library-browse-item-active nadd-browse-item-active' : ''}`}
          aria-pressed={activeGroupId === null}
          onClick={() => {
            setActiveRecipeId(null);
            setActiveGroupId(null);
            setActiveIndex(0);
          }}
        >
          All
        </ToolbarButton>
        {groups.map((group) => (
          <ToolbarButton
            key={group.id}
            type="button"
            className={`add-library-browse-item nadd-browse-item${activeGroupId === group.id ? ' add-library-browse-item-active nadd-browse-item-active' : ''}`}
            title={group.hint}
            aria-pressed={activeGroupId === group.id}
            onClick={() => {
              setActiveRecipeId(null);
              setActiveGroupId((current) => (current === group.id ? null : group.id));
              setActiveIndex(0);
            }}
          >
            {group.label}
          </ToolbarButton>
        ))}
      </div>

      {recipes.length > 0 && (
        <div className="add-library-recipes nadd-recipes" aria-label="Recipe node groups">
          {recipes.map((recipe) => (
            <ToolbarButton
              key={recipe.id}
              type="button"
              className={`add-library-recipe nadd-recipe${activeRecipeId === recipe.id ? ' add-library-recipe-active nadd-recipe-active' : ''}`}
              title={recipe.hint}
              aria-pressed={activeRecipeId === recipe.id}
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                setActiveGroupId(null);
                setActiveRecipeId((current) => (current === recipe.id ? null : recipe.id));
              }}
            >
              {recipe.label}
            </ToolbarButton>
          ))}
        </div>
      )}

      <div className="add-library-body">
        <div className="add-library-list nadd-list nadd-flat-list" onWheelCapture={(event) => event.stopPropagation()}>
          {sections.length === 0 || flatItems.length === 0 ? (
            <EmptyState className="add-library-empty nadd-empty" title="No matches" />
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
        <AddLibraryDetail
          item={activeItem}
          favorite={activeItem ? favoriteIds.includes(activeItem.id) : false}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>
    </>
  );
}

function AddLibraryDetail({
  item,
  favorite,
  onToggleFavorite,
}: {
  item: AddLibraryItem | null;
  favorite: boolean;
  onToggleFavorite: (item: AddLibraryItem) => void;
}) {
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
            {item.tags && item.tags.length > 0 && (
              <span className="add-library-tags" aria-label="Use cases">
                {item.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} className="add-library-tag">
                    {tag}
                  </Badge>
                ))}
              </span>
            )}
            <ActionButton
              type="button"
              className={`add-library-favorite${favorite ? ' add-library-favorite-active' : ''}`}
              variant="quiet"
              aria-pressed={favorite}
              onClick={() => onToggleFavorite(item)}
            >
              {favorite ? 'Favorited' : 'Add favorite'}
            </ActionButton>
          </div>
        </>
      ) : (
        <EmptyState className="add-library-detail-empty" title="Choose an item" body="Search or browse the library." />
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
        const serialized = serializeAddLibraryAction(item.action);
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData(ADD_LIBRARY_ACTION_MIME, serialized);
        event.dataTransfer.setData('text/plain', item.label);
        document.documentElement.dataset.artifactAddLibraryAction = serialized;
      }}
      onDragEnd={() => {
        delete document.documentElement.dataset.artifactAddLibraryAction;
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
      {draggable && <span className="add-library-row-drag">Drag</span>}
      {group && <Badge className="add-library-row-tag nadd-row-tag">{group.label}</Badge>}
    </button>
  );
}

function recentKey(surface: AddLibrarySurface) {
  return `artifact:add-library:${surface}:recent`;
}

function readRecent(surface: AddLibrarySurface): string[] {
  return readStoredIdList(recentKey(surface));
}

function writeRecent(surface: AddLibrarySurface, ids: string[]) {
  try {
    window.localStorage.setItem(recentKey(surface), JSON.stringify(ids));
  } catch {
    // Recent items are a convenience only; adding the layer/node should never depend on storage.
  }
}

function favoriteKey(surface: AddLibrarySurface) {
  return `artifact:add-library:${surface}:favorites`;
}

function readFavorites(surface: AddLibrarySurface): string[] {
  return readStoredIdList(favoriteKey(surface));
}

function writeFavorites(surface: AddLibrarySurface, ids: string[]) {
  try {
    window.localStorage.setItem(favoriteKey(surface), JSON.stringify(ids));
  } catch {
    // Favorites are local menu convenience only; adding should not depend on storage.
  }
}

function readStoredIdList(key: string): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : [];
  } catch {
    return [];
  }
}
