import { Button } from '@artifact/ui';
import { forwardRef, type KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Badge } from '../ui/Badge';
import { EmptyState } from '../ui/EmptyState';
import { SearchField } from '../ui/SearchField';
import { ToolbarButton } from '../ui/Toolbar';
import { AddLibraryPreview } from './AddLibraryPreview';
import {
  ADD_LIBRARY_ACTION_MIME,
  ADD_LIBRARY_GROUPS,
  type AddLibraryAction,
  type AddLibraryItem,
  type AddLibrarySurface,
  addLibraryBrowseItemsForSurface,
  addLibraryItemsForSurface,
  addLibraryRecipesForSurface,
  searchAddLibraryItems,
  serializeAddLibraryAction,
} from './addLibraryModel';

const RECENT_LIMIT = 6;
const FAVORITE_LIMIT = 12;

type AddLibraryIntentId = 'sources' | 'effects' | 'structure' | 'color' | 'threeD' | 'recipes';
type AddLibraryRecipe = ReturnType<typeof addLibraryRecipesForSurface>[number];

interface AddLibrarySection {
  id: string;
  label: string;
  hint: string;
  items: AddLibraryItem[];
}

const ADD_LIBRARY_INTENTS: Array<{
  id: AddLibraryIntentId;
  label: string;
  hint: string;
  colorKind: string;
}> = [
  { id: 'sources', label: 'Sources', hint: 'Images, type, generated bases', colorKind: 'image' },
  { id: 'effects', label: 'Effects', hint: 'Pixel transforms and print finish', colorKind: 'effect' },
  { id: 'structure', label: 'Structure', hint: 'Merge, repeat, mask, transform', colorKind: 'merge' },
  { id: 'color', label: 'Color', hint: 'Tone, palette, grading', colorKind: 'color' },
  { id: 'threeD', label: '3D', hint: 'Models, materials, scenes', colorKind: 'primitive' },
  { id: 'recipes', label: 'Recipes', hint: 'Node groups for common looks', colorKind: 'merge' },
];

function addLibraryIntentsForSurface(recipes: readonly AddLibraryRecipe[]) {
  return recipes.length > 0 ? ADD_LIBRARY_INTENTS : ADD_LIBRARY_INTENTS.filter((intent) => intent.id !== 'recipes');
}

function itemsForIds(ids: readonly string[], itemById: Map<string, AddLibraryItem>) {
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
  const favoriteIdSet = new Set(favoriteIds);
  const recentItems = itemsForIds(
    recentIds.filter((id) => !favoriteIdSet.has(id)),
    itemById,
  );
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

function searchSection(activeScope: AddLibraryScope | null, searchResults: AddLibraryItem[]): AddLibrarySection[] {
  return [
    {
      id: 'search',
      label: activeScope ? `${activeScope.label} Search` : 'Search',
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

function hasActiveLibraryScope(query: string, activeIntentId: AddLibraryIntentId | null) {
  return Boolean(query || activeIntentId);
}

type AddLibraryScope = { id: string; label: string; hint: string };

function activeAddLibraryIntent(id: AddLibraryIntentId | null) {
  return ADD_LIBRARY_INTENTS.find((intent) => intent.id === id) ?? null;
}

function scopedAddLibraryItems(
  items: AddLibraryItem[],
  activeIntentId: AddLibraryIntentId | null,
  recipes: readonly AddLibraryRecipe[],
) {
  if (activeIntentId === 'recipes') {
    const recipeItemIds = new Set(recipes.flatMap((recipe) => recipe.itemIds));
    return items.filter((item) => recipeItemIds.has(item.id));
  }
  if (activeIntentId) return items.filter((item) => itemMatchesIntent(item, activeIntentId));
  return items;
}

function itemMatchesIntent(item: AddLibraryItem, intentId: Exclude<AddLibraryIntentId, 'recipes'>) {
  switch (intentId) {
    case 'sources':
      return (
        item.group === 'content' ||
        item.group === 'source' ||
        item.group === 'shaderFill' ||
        item.action.kind === 'textPreset' ||
        item.action.kind === 'noisePreset' ||
        item.action.kind === 'arrayPreset' ||
        item.action.kind === 'shader'
      );
    case 'effects':
      return item.action.kind === 'effect';
    case 'structure':
      return ['merge', 'repeat', 'repeatPreset', 'mask', 'transform', 'grimeShadow'].includes(item.action.kind);
    case 'color':
      return (
        item.action.kind === 'color' ||
        item.group === 'tone' ||
        item.id === 'effect:duotone' ||
        item.id === 'effect:splitTone' ||
        item.id === 'effect:indexedPalette'
      );
    case 'threeD':
      return (
        item.group === 'material' ||
        item.action.kind === 'material' ||
        item.action.kind === 'scene3d' ||
        item.action.kind === 'environment' ||
        (item.action.kind === 'layer' && ['primitive', 'model'].includes(item.action.layerKind))
      );
  }
}

function favoriteClassName(favorite: boolean) {
  return `add-library-favorite${favorite ? ' add-library-favorite-active' : ''}`;
}

function addLibraryColorKind(item: AddLibraryItem) {
  switch (item.action.kind) {
    case 'layer':
      return item.action.layerKind;
    case 'textPreset':
      return 'text';
    case 'aiImage':
      return 'image';
    case 'noisePreset':
    case 'shader':
      return 'noise';
    case 'arrayPreset':
    case 'repeat':
    case 'repeatPreset':
      return 'array';
    case 'effect':
      return 'effect';
    case 'merge':
    case 'mask':
    case 'grimeShadow':
      return 'merge';
    case 'color':
    case 'transform':
    case 'environment':
      return 'color';
    case 'material':
    case 'scene3d':
      return 'primitive';
  }
}

function addLibraryResultLabel(item: AddLibraryItem) {
  switch (item.action.kind) {
    case 'layer':
      return `Adds ${item.action.layerKind} layer`;
    case 'textPreset':
      return 'Adds text preset';
    case 'aiImage':
      return 'Starts AI image source';
    case 'noisePreset':
      return 'Adds noise source';
    case 'arrayPreset':
      return 'Adds array source';
    case 'effect':
      return 'Adds effect';
    case 'merge':
      return 'Adds merge node';
    case 'color':
      return 'Adds color node';
    case 'repeat':
    case 'repeatPreset':
      return 'Adds repeat node';
    case 'material':
      return 'Adds material node';
    case 'mask':
      return 'Adds mask node';
    case 'transform':
      return 'Adds transform node';
    case 'grimeShadow':
      return 'Adds grime shadow node';
    case 'scene3d':
      return 'Adds 3D scene';
    case 'environment':
      return 'Adds environment node';
    case 'shader':
      return 'Adds shader fill';
  }
}

function canAddActiveLibraryItem(key: string, item: AddLibraryItem | null): item is AddLibraryItem {
  return key === 'Enter' && item !== null;
}

function recipeSections(recipes: readonly AddLibraryRecipe[], itemById: Map<string, AddLibraryItem>) {
  return recipes.map((recipe) => ({
    id: `recipe-${recipe.id}`,
    label: recipe.label,
    hint: recipe.hint,
    items: itemsForIds(recipe.itemIds, itemById),
  }));
}

function resolveAddLibrarySections({
  activeIntent,
  browsableItems,
  browsableScopedItems,
  favoriteIds,
  isSearching,
  itemById,
  recentIds,
  recipes,
  searchResults,
}: {
  activeIntent: ReturnType<typeof activeAddLibraryIntent>;
  browsableItems: AddLibraryItem[];
  browsableScopedItems: AddLibraryItem[];
  favoriteIds: string[];
  isSearching: boolean;
  itemById: Map<string, AddLibraryItem>;
  recentIds: string[];
  recipes: readonly AddLibraryRecipe[];
  searchResults: AddLibraryItem[];
}): AddLibrarySection[] {
  if (isSearching) return searchSection(activeIntent, searchResults);
  if (activeIntent?.id === 'recipes') return recipeSections(recipes, itemById);
  if (activeIntent) return singleSection(activeIntent.id, activeIntent.label, activeIntent.hint, browsableScopedItems);
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
  initialFavoriteIds,
  initialRecentIds,
  persistActivity = true,
}: {
  surface: AddLibrarySurface;
  searchLabel: string;
  placeholder: string;
  onAdd: (action: AddLibraryAction) => void;
  onClose: () => void;
  autoFocusSearch?: boolean;
  draggable?: boolean;
  initialFavoriteIds?: string[];
  initialRecentIds?: string[];
  persistActivity?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [activeIntentId, setActiveIntentId] = useState<AddLibraryIntentId | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [recentIds, setRecentIds] = useState<string[]>(() => initialRecentIds ?? readRecent(surface));
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => initialFavoriteIds ?? readFavorites(surface));
  const inputRef = useRef<HTMLInputElement>(null);
  const resultListId = useId();

  const items = useMemo(() => addLibraryItemsForSurface(surface), [surface]);
  const browsableItems = useMemo(() => addLibraryBrowseItemsForSurface(surface), [surface]);
  const recipes = useMemo(() => addLibraryRecipesForSurface(surface), [surface]);
  const intents = useMemo(() => addLibraryIntentsForSurface(recipes), [recipes]);
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const activeIntent = activeAddLibraryIntent(activeIntentId);
  const scopedItems = scopedAddLibraryItems(items, activeIntentId, recipes);
  const browsableScopedItems = useMemo(
    () => scopedAddLibraryItems(browsableItems, activeIntentId, recipes),
    [activeIntentId, browsableItems, recipes],
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

  const sections = useMemo(
    () =>
      resolveAddLibrarySections({
        activeIntent,
        browsableItems,
        browsableScopedItems,
        favoriteIds,
        isSearching,
        itemById,
        recentIds,
        recipes,
        searchResults,
      }),
    [
      activeIntent,
      browsableItems,
      browsableScopedItems,
      favoriteIds,
      isSearching,
      itemById,
      recentIds,
      recipes,
      searchResults,
    ],
  );

  const flatItems = useMemo(() => sections.flatMap((section) => section.items), [sections]);
  const activeItem = flatItems[Math.min(activeIndex, Math.max(0, flatItems.length - 1))] ?? null;

  const handleAdd = (item: AddLibraryItem) => {
    const nextRecentIds = [item.id, ...recentIds.filter((id) => id !== item.id)].slice(0, RECENT_LIMIT);
    setRecentIds(nextRecentIds);
    if (persistActivity) writeRecent(surface, nextRecentIds);
    onAdd(item.action);
  };

  const handleToggleFavorite = (item: AddLibraryItem) => {
    const nextFavoriteIds = favoriteIds.includes(item.id)
      ? favoriteIds.filter((id) => id !== item.id)
      : [item.id, ...favoriteIds].slice(0, FAVORITE_LIMIT);
    setFavoriteIds(nextFavoriteIds);
    if (persistActivity) writeFavorites(surface, nextFavoriteIds);
  };

  const resetLibraryScope = () => {
    setQuery('');
    setActiveIntentId(null);
    setActiveIndex(0);
  };

  const handleEscapeKey = () => {
    const resetsScope = hasActiveLibraryScope(query, activeIntentId);
    if (resetsScope) resetLibraryScope();
    else onClose();
    return resetsScope;
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (handleEscapeKey()) {
        event.preventDefault();
        event.stopPropagation();
      }
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
        activeDescendantId={activeItem ? `${resultListId}-option-${activeIndex}` : undefined}
        scopeActive={hasActiveLibraryScope(query, activeIntentId)}
        resultListId={resultListId}
        searchLabel={searchLabel}
        placeholder={placeholder}
        value={query}
        onChange={(value) => {
          setQuery(value);
          setActiveIndex(0);
        }}
        onKeyDown={handleKeyDown}
      />

      <AddLibraryFilterTabs
        intents={intents}
        activeIntentId={activeIntentId}
        onSelectIntent={(intentId) => {
          setActiveIntentId(intentId);
          setActiveIndex(0);
        }}
      />

      <AddLibraryBody
        resultListId={resultListId}
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
    activeDescendantId?: string;
    scopeActive: boolean;
    resultListId: string;
    searchLabel: string;
    placeholder: string;
    value: string;
    onChange: (value: string) => void;
    onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  }
>(function AddLibrarySearchControl(
  { activeDescendantId, scopeActive, resultListId, searchLabel, placeholder, value, onChange, onKeyDown },
  ref,
) {
  return (
    <SearchField
      ref={ref}
      className="add-library-search nadd-search"
      clearClassName="add-library-search-clear nadd-search-clear"
      inputClassName="add-library-search-input nadd-search-input"
      aria-label={searchLabel}
      role="combobox"
      aria-autocomplete="list"
      aria-controls={resultListId}
      aria-expanded="true"
      aria-activedescendant={activeDescendantId}
      data-add-library-scope-active={scopeActive ? 'true' : 'false'}
      placeholder={placeholder}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
});

/** The one filter axis: All, or one intent. Search narrows within the active filter. */
function AddLibraryFilterTabs({
  intents,
  activeIntentId,
  onSelectIntent,
}: {
  intents: typeof ADD_LIBRARY_INTENTS;
  activeIntentId: AddLibraryIntentId | null;
  onSelectIntent: (intentId: AddLibraryIntentId | null) => void;
}) {
  return (
    <div className="add-library-intents nadd-intents" role="group" aria-label="Filter library">
      <ToolbarButton
        type="button"
        className={`add-library-intent nadd-intent${activeIntentId === null ? ' add-library-intent-active nadd-intent-active' : ''}`}
        aria-pressed={activeIntentId === null}
        onClick={() => onSelectIntent(null)}
      >
        All
      </ToolbarButton>
      {intents.map((intent) => (
        <ToolbarButton
          key={intent.id}
          type="button"
          className={`add-library-intent nadd-intent${activeIntentId === intent.id ? ' add-library-intent-active nadd-intent-active' : ''}`}
          data-add-color-kind={intent.colorKind}
          title={intent.hint}
          aria-pressed={activeIntentId === intent.id}
          onClick={() => onSelectIntent(activeIntentId === intent.id ? null : intent.id)}
        >
          {intent.label}
        </ToolbarButton>
      ))}
    </div>
  );
}

function AddLibraryBody({
  resultListId,
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
  resultListId: string;
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
        resultListId={resultListId}
        sections={sections}
        flatItems={flatItems}
        activeIndex={activeIndex}
        draggable={draggable}
        onActivateItem={onActivateItem}
        onAdd={onAdd}
      />
      <AddLibraryDetail item={activeItem} favorite={favorite} onAdd={onAdd} onToggleFavorite={onToggleFavorite} />
    </div>
  );
}

function AddLibraryList({
  resultListId,
  sections,
  flatItems,
  activeIndex,
  draggable,
  onActivateItem,
  onAdd,
}: {
  resultListId: string;
  sections: AddLibrarySection[];
  flatItems: AddLibraryItem[];
  activeIndex: number;
  draggable: boolean;
  onActivateItem: (index: number) => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  const empty = sections.length === 0 || flatItems.length === 0;

  useEffect(() => {
    if (empty) return;
    const option = document.getElementById(`${resultListId}-option-${activeIndex}`);
    if (!option) return;
    const pageScroll = { left: window.scrollX, top: window.scrollY };
    option.scrollIntoView({ block: 'nearest' });
    if (window.scrollX !== pageScroll.left || window.scrollY !== pageScroll.top) {
      window.scrollTo(pageScroll);
    }
  }, [activeIndex, empty, resultListId]);

  return (
    <div
      id={resultListId}
      className="add-library-list nadd-list nadd-flat-list"
      role="listbox"
      aria-label="Library results"
      onWheelCapture={(event) => event.stopPropagation()}
    >
      {empty ? (
        <EmptyState className="add-library-empty nadd-empty" title="No matches" />
      ) : (
        sections.map((section, sectionIndex) => (
          <AddLibrarySectionRows
            key={section.id}
            section={section}
            resultListId={resultListId}
            firstIndex={sectionFirstIndex(sections, sectionIndex)}
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

/** Position of a section's first row in the flat option list; an item can appear in more than one section. */
function sectionFirstIndex(sections: AddLibrarySection[], sectionIndex: number) {
  return sections.slice(0, sectionIndex).reduce((count, section) => count + section.items.length, 0);
}

function AddLibrarySectionRows({
  section,
  resultListId,
  firstIndex,
  activeIndex,
  draggable,
  onActivateItem,
  onAdd,
}: {
  section: AddLibrarySection;
  resultListId: string;
  firstIndex: number;
  activeIndex: number;
  draggable: boolean;
  onActivateItem: (index: number) => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  const sectionColorKind =
    section.items.length > 0 && section.items.every((item) => item.group === section.items[0]?.group)
      ? addLibraryColorKind(section.items[0]!)
      : undefined;
  return (
    <div className="add-library-section nadd-section" role="group" aria-label={section.label}>
      <div
        className="add-library-section-header nadd-section-header"
        data-add-color-kind={sectionColorKind}
        aria-hidden="true"
      >
        <span>{section.label}</span>
        <small>{section.hint}</small>
      </div>
      {section.items.map((item, index) => {
        const itemIndex = firstIndex + index;
        return (
          <AddLibraryRow
            key={`${section.id}-${item.id}`}
            item={item}
            active={itemIndex === activeIndex}
            optionId={`${resultListId}-option-${itemIndex}`}
            draggable={draggable}
            onPointerMove={() => onActivateItem(itemIndex)}
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
  onAdd,
  onToggleFavorite,
}: {
  item: AddLibraryItem | null;
  favorite: boolean;
  onAdd: (item: AddLibraryItem) => void;
  onToggleFavorite: (item: AddLibraryItem) => void;
}) {
  if (!item) {
    return (
      <aside className="add-library-detail" aria-hidden={true}>
        <EmptyState className="add-library-detail-empty" title="Choose an item" body="Search or browse the library." />
      </aside>
    );
  }

  const colorKind = addLibraryColorKind(item);
  return (
    <aside
      className="add-library-detail"
      data-add-color-kind={colorKind}
      data-add-kind={item.group}
      aria-hidden={false}
    >
      <AddLibraryDetailContent item={item} favorite={favorite} onAdd={onAdd} onToggleFavorite={onToggleFavorite} />
    </aside>
  );
}

function AddLibraryDetailContent({
  item,
  favorite,
  onAdd,
  onToggleFavorite,
}: {
  item: AddLibraryItem;
  favorite: boolean;
  onAdd: (item: AddLibraryItem) => void;
  onToggleFavorite: (item: AddLibraryItem) => void;
}) {
  const group = ADD_LIBRARY_GROUPS.find((entry) => entry.id === item.group);
  return (
    <>
      <AddLibraryPreview item={item} />
      <div className="add-library-detail-copy">
        <span className="add-library-detail-kicker">{group?.label ?? 'Add'}</span>
        <strong>{item.label}</strong>
        <span className="add-library-detail-result">{addLibraryResultLabel(item)}</span>
        <p>{item.description}</p>
        <AddLibraryTags tags={item.tags} />
        <Button type="button" variant="primary" onClick={() => onAdd(item)}>
          Add {item.label}
        </Button>
        <Button
          type="button"
          className={favoriteClassName(favorite)}
          variant="quiet"
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(item)}
        >
          {favorite ? 'Favorited' : 'Add favorite'}
        </Button>
      </div>
    </>
  );
}

function AddLibraryTags({ tags }: { tags: readonly string[] | undefined }) {
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
  optionId,
  draggable,
  onPointerMove,
  onAdd,
}: {
  item: AddLibraryItem;
  active: boolean;
  optionId: string;
  draggable: boolean;
  onPointerMove: () => void;
  onAdd: (item: AddLibraryItem) => void;
}) {
  const group = ADD_LIBRARY_GROUPS.find((entry) => entry.id === item.group);
  const colorKind = addLibraryColorKind(item);
  return (
    <button
      id={optionId}
      type="button"
      role="option"
      aria-selected={active}
      className={`add-library-row nadd-row${active ? ' add-library-row-active' : ''}`}
      data-add-color-kind={colorKind}
      data-add-kind={item.group}
      draggable={draggable}
      onPointerMove={onPointerMove}
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
      <span
        className="add-library-row-symbol nadd-row-symbol"
        data-add-color-kind={colorKind}
        data-add-kind={item.group}
      >
        {item.symbol}
      </span>
      <span className="add-library-row-copy nadd-row-copy">
        <span className="add-library-row-label nadd-row-label">{item.label}</span>
        <span className="add-library-row-desc nadd-row-desc">{item.description}</span>
      </span>
      {draggable && <span className="add-library-row-drag">Drag</span>}
      {group && (
        <Badge className="add-library-row-tag nadd-row-tag" data-add-color-kind={colorKind} data-add-kind={item.group}>
          {group.label}
        </Badge>
      )}
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
