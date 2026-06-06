import { forwardRef, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
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

interface AddLibrarySection {
  id: string;
  label: string;
  hint: string;
  items: AddLibraryItem[];
}

function itemsForIds(ids: string[], itemById: Map<string, AddLibraryItem>) {
  return ids.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item));
}

function buildDefaultSections({
  browsableItems,
  favoriteIds,
  itemById,
  recentIds,
}: {
  browsableItems: AddLibraryItem[];
  favoriteIds: string[];
  itemById: Map<string, AddLibraryItem>;
  recentIds: string[];
}): AddLibrarySection[] {
  const favoriteItems = itemsForIds(favoriteIds, itemById);
  const recentItems = itemsForIds(recentIds, itemById);
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
    ...(popularItems.length > 0 ? [{ id: 'popular', label: 'Popular', hint: 'Fast starts', items: popularItems }] : []),
    ...grouped,
  ];
}

function searchSection(
  activeGroup: ReturnType<typeof addLibraryGroupsForSurface>[number] | null,
  searchResults: AddLibraryItem[],
): AddLibrarySection[] {
  return [
    {
      id: 'search',
      label: activeGroup ? `${activeGroup.label} Search` : 'Search',
      hint: `${searchResults.length} matches`,
      items: searchResults,
    },
  ];
}

function singleSection(id: string, label: string, hint: string, items: AddLibraryItem[]): AddLibrarySection[] {
  return [{ id, label, hint, items }];
}

const LIBRARY_INDEX_UPDATERS: Record<string, (currentIndex: number, lastIndex: number) => number> = {
  ArrowDown: (currentIndex, lastIndex) => Math.min(lastIndex, currentIndex + 1),
  ArrowUp: (currentIndex) => Math.max(0, currentIndex - 1),
  Home: () => 0,
  End: (_currentIndex, lastIndex) => lastIndex,
};

function nextLibraryIndexForKey(key: string, currentIndex: number, itemCount: number): number | null {
  return LIBRARY_INDEX_UPDATERS[key]?.(currentIndex, Math.max(0, itemCount - 1)) ?? null;
}

function hasActiveLibraryScope(query: string, activeRecipeId: string | null, activeGroupId: AddLibraryGroupId | null) {
  return Boolean(query || activeRecipeId || activeGroupId);
}

function activeAddLibraryGroup(groups: ReturnType<typeof addLibraryGroupsForSurface>, id: AddLibraryGroupId | null) {
  return groups.find((group) => group.id === id) ?? null;
}

function activeAddLibraryRecipe(recipes: ReturnType<typeof addLibraryRecipesForSurface>, id: string | null) {
  return recipes.find((recipe) => recipe.id === id) ?? null;
}

function scopedAddLibraryItems(items: AddLibraryItem[], activeGroupId: AddLibraryGroupId | null) {
  return activeGroupId ? items.filter((item) => item.group === activeGroupId) : items;
}

function favoriteClassName(favorite: boolean) {
  return `add-library-favorite${favorite ? ' add-library-favorite-active' : ''}`;
}

function canAddActiveLibraryItem(key: string, item: AddLibraryItem | null): item is AddLibraryItem {
  return key === 'Enter' && item !== null;
}

function recipeLibraryItems(
  recipe: ReturnType<typeof activeAddLibraryRecipe>,
  itemById: Map<string, AddLibraryItem>,
): AddLibraryItem[] {
  return recipe?.itemIds.map((id) => itemById.get(id)).filter((item): item is AddLibraryItem => Boolean(item)) ?? [];
}

function resolveAddLibrarySections({
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
}: {
  activeGroup: ReturnType<typeof activeAddLibraryGroup>;
  activeRecipe: ReturnType<typeof activeAddLibraryRecipe>;
  browsableItems: AddLibraryItem[];
  browsableScopedItems: AddLibraryItem[];
  favoriteIds: string[];
  isSearching: boolean;
  itemById: Map<string, AddLibraryItem>;
  recentIds: string[];
  recipeItems: AddLibraryItem[];
  searchResults: AddLibraryItem[];
}): AddLibrarySection[] {
  if (isSearching) return searchSection(activeGroup, searchResults);
  if (activeRecipe) return singleSection(activeRecipe.id, activeRecipe.label, activeRecipe.hint, recipeItems);
  if (activeGroup) return singleSection(activeGroup.id, activeGroup.label, activeGroup.hint, browsableScopedItems);
  return buildDefaultSections({ browsableItems, favoriteIds, itemById, recentIds });
}

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
  const activeRecipe = activeAddLibraryRecipe(recipes, activeRecipeId);
  const activeGroup = activeAddLibraryGroup(groups, activeGroupId);
  const scopedItems = scopedAddLibraryItems(items, activeGroupId);
  const browsableScopedItems = useMemo(
    () => scopedAddLibraryItems(browsableItems, activeGroupId),
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

  const recipeItems = useMemo(() => recipeLibraryItems(activeRecipe, itemById), [activeRecipe, itemById]);

  const sections = useMemo(
    () =>
      resolveAddLibrarySections({
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
      }),
    [
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
    ],
  );

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

  const resetLibraryScope = () => {
    setQuery('');
    setActiveRecipeId(null);
    setActiveGroupId(null);
    setActiveIndex(0);
  };

  const handleEscapeKey = () => {
    if (hasActiveLibraryScope(query, activeRecipeId, activeGroupId)) resetLibraryScope();
    else onClose();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      handleEscapeKey();
      return;
    }

    const nextIndex = nextLibraryIndexForKey(event.key, activeIndex, flatItems.length);
    if (nextIndex !== null) {
      event.preventDefault();
      setActiveIndex(nextIndex);
      return;
    }

    if (canAddActiveLibraryItem(event.key, activeItem)) {
      event.preventDefault();
      handleAdd(activeItem);
    }
  };

  return (
    <>
      <AddLibrarySearchControl
        ref={inputRef}
        searchLabel={searchLabel}
        placeholder={placeholder}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setActiveRecipeId(null);
          setActiveIndex(0);
        }}
        onClear={() => {
          setQuery('');
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />

      <AddLibraryBrowseTabs
        groups={groups}
        activeGroupId={activeGroupId}
        onShowAll={() => {
          setActiveRecipeId(null);
          setActiveGroupId(null);
          setActiveIndex(0);
        }}
        onToggleGroup={(groupId) => {
          setActiveRecipeId(null);
          setActiveGroupId((current) => (current === groupId ? null : groupId));
          setActiveIndex(0);
        }}
      />

      <AddLibraryRecipeTabs
        recipes={recipes}
        activeRecipeId={activeRecipeId}
        onToggleRecipe={(recipeId) => {
          setQuery('');
          setActiveIndex(0);
          setActiveGroupId(null);
          setActiveRecipeId((current) => (current === recipeId ? null : recipeId));
        }}
      />

      <AddLibraryBody
        sections={sections}
        flatItems={flatItems}
        activeIndex={activeIndex}
        activeItem={activeItem}
        draggable={draggable}
        favorite={activeItem ? favoriteIds.includes(activeItem.id) : false}
        onActivateItem={setActiveIndex}
        onAdd={handleAdd}
        onToggleFavorite={handleToggleFavorite}
      />
    </>
  );
}

const AddLibrarySearchControl = forwardRef<
  HTMLInputElement,
  {
    searchLabel: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onClear: () => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  }
>(function AddLibrarySearchControl({ searchLabel, placeholder, value, onChange, onClear, onKeyDown }, ref) {
  return (
    <SearchField
      ref={ref}
      className="add-library-search nadd-search"
      clearClassName="add-library-search-clear nadd-search-clear"
      inputClassName="add-library-search-input nadd-search-input"
      aria-label={searchLabel}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClear={onClear}
      onKeyDown={onKeyDown}
    />
  );
});

function AddLibraryBrowseTabs({
  groups,
  activeGroupId,
  onShowAll,
  onToggleGroup,
}: {
  groups: ReturnType<typeof addLibraryGroupsForSurface>;
  activeGroupId: AddLibraryGroupId | null;
  onShowAll: () => void;
  onToggleGroup: (groupId: AddLibraryGroupId) => void;
}) {
  return (
    <div className="add-library-browse nadd-browse" aria-label="Browse library groups">
      <ToolbarButton
        type="button"
        className={`add-library-browse-item nadd-browse-item${activeGroupId === null ? ' add-library-browse-item-active nadd-browse-item-active' : ''}`}
        aria-pressed={activeGroupId === null}
        onClick={onShowAll}
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
          onClick={() => onToggleGroup(group.id)}
        >
          {group.label}
        </ToolbarButton>
      ))}
    </div>
  );
}

function AddLibraryRecipeTabs({
  recipes,
  activeRecipeId,
  onToggleRecipe,
}: {
  recipes: ReturnType<typeof addLibraryRecipesForSurface>;
  activeRecipeId: string | null;
  onToggleRecipe: (recipeId: string) => void;
}) {
  if (recipes.length === 0) return null;
  return (
    <div className="add-library-recipes nadd-recipes" aria-label="Recipe node groups">
      {recipes.map((recipe) => (
        <ToolbarButton
          key={recipe.id}
          type="button"
          className={`add-library-recipe nadd-recipe${activeRecipeId === recipe.id ? ' add-library-recipe-active nadd-recipe-active' : ''}`}
          title={recipe.hint}
          aria-pressed={activeRecipeId === recipe.id}
          onClick={() => onToggleRecipe(recipe.id)}
        >
          {recipe.label}
        </ToolbarButton>
      ))}
    </div>
  );
}

function AddLibraryBody({
  sections,
  flatItems,
  activeIndex,
  activeItem,
  draggable,
  favorite,
  onActivateItem,
  onAdd,
  onToggleFavorite,
}: {
  sections: AddLibrarySection[];
  flatItems: AddLibraryItem[];
  activeIndex: number;
  activeItem: AddLibraryItem | null;
  draggable: boolean;
  favorite: boolean;
  onActivateItem: (index: number) => void;
  onAdd: (item: AddLibraryItem) => void;
  onToggleFavorite: (item: AddLibraryItem) => void;
}) {
  return (
    <div className="add-library-body">
      <AddLibraryList
        sections={sections}
        flatItems={flatItems}
        activeIndex={activeIndex}
        draggable={draggable}
        onActivateItem={onActivateItem}
        onAdd={onAdd}
      />
      <AddLibraryDetail item={activeItem} favorite={favorite} onToggleFavorite={onToggleFavorite} />
    </div>
  );
}

function AddLibraryList({
  sections,
  flatItems,
  activeIndex,
  draggable,
  onActivateItem,
  onAdd,
}: {
  sections: AddLibrarySection[];
  flatItems: AddLibraryItem[];
  activeIndex: number;
  draggable: boolean;
  onActivateItem: (index: number) => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  const empty = sections.length === 0 || flatItems.length === 0;
  return (
    <div className="add-library-list nadd-list nadd-flat-list" onWheelCapture={(event) => event.stopPropagation()}>
      {empty ? (
        <EmptyState className="add-library-empty nadd-empty" title="No matches" />
      ) : (
        sections.map((section) => (
          <AddLibrarySectionRows
            key={section.id}
            section={section}
            flatItems={flatItems}
            activeIndex={activeIndex}
            draggable={draggable}
            onActivateItem={onActivateItem}
            onAdd={onAdd}
          />
        ))
      )}
    </div>
  );
}

function AddLibrarySectionRows({
  section,
  flatItems,
  activeIndex,
  draggable,
  onActivateItem,
  onAdd,
}: {
  section: AddLibrarySection;
  flatItems: AddLibraryItem[];
  activeIndex: number;
  draggable: boolean;
  onActivateItem: (index: number) => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  return (
    <div className="add-library-section nadd-section">
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
            onPointerEnter={() => onActivateItem(itemIndex)}
            onAdd={onAdd}
          />
        );
      })}
    </div>
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
  if (!item) {
    return (
      <aside className="add-library-detail" aria-hidden={true}>
        <EmptyState className="add-library-detail-empty" title="Choose an item" body="Search or browse the library." />
      </aside>
    );
  }

  return (
    <aside className="add-library-detail" aria-hidden={false}>
      <AddLibraryDetailContent item={item} favorite={favorite} onToggleFavorite={onToggleFavorite} />
    </aside>
  );
}

function AddLibraryDetailContent({
  item,
  favorite,
  onToggleFavorite,
}: {
  item: AddLibraryItem;
  favorite: boolean;
  onToggleFavorite: (item: AddLibraryItem) => void;
}) {
  const group = ADD_LIBRARY_GROUPS.find((entry) => entry.id === item.group);
  return (
    <>
      <AddLibraryPreview item={item} />
      <div className="add-library-detail-copy">
        <span className="add-library-detail-kicker">{group?.label ?? 'Add'}</span>
        <strong>{item.label}</strong>
        <p>{item.description}</p>
        <AddLibraryTags tags={item.tags} />
        <ActionButton
          type="button"
          className={favoriteClassName(favorite)}
          variant="quiet"
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(item)}
        >
          {favorite ? 'Favorited' : 'Add favorite'}
        </ActionButton>
      </div>
    </>
  );
}

function AddLibraryTags({ tags }: { tags: string[] | undefined }) {
  if (!tags?.length) return null;
  return (
    <span className="add-library-tags" aria-label="Use cases">
      {tags.slice(0, 4).map((tag) => (
        <Badge key={tag} className="add-library-tag">
          {tag}
        </Badge>
      ))}
    </span>
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
    return parseStoredIdList(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function parseStoredIdList(value: string | null): string[] {
  const parsed = JSON.parse(value ?? '[]');
  return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
}
