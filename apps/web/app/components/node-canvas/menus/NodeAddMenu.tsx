import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';

import type { EffectPreset } from '../../../types/config';
import { ADD_GROUPS, ADD_ITEMS, KIND_COLOR } from '../constants';
import { clampPopupPosition } from '../helpers';
import { NoPan } from '../nodes/NoPan';
import type { AddAction, PaneMenuProps } from '../types';

const MENU_W = 320;

type AddItem = (typeof ADD_ITEMS)[number];

const RECIPE_FILTERS = [
  {
    id: 'photo-type',
    label: 'Photo + Type',
    hint: 'image / duotone / title / grain',
    actions: ['layer:fill', 'layer:image', 'effect:duotone', 'layer:text', 'effect:grain'],
  },
  {
    id: 'texture-type',
    label: 'Texture Type',
    hint: 'noise / title / print finish',
    actions: [
      'layer:fill',
      'layer:noise',
      'noisePreset:paper',
      'layer:text',
      'effect:risoShift',
      'effect:scanlines',
      'effect:grain',
    ],
  },
  {
    id: 'sticker-grid',
    label: 'Sticker Grid',
    hint: 'paper / array / registration',
    actions: [
      'noisePreset:paper',
      'arrayPreset:stickerGrid',
      'repeatPreset:stickerGrid',
      'effect:risoShift',
      'layer:text',
      'effect:overprint',
    ],
  },
  {
    id: 'primitive-image',
    label: 'Primitive + Image',
    hint: 'object branch / image branch / merge',
    actions: [
      'layer:image',
      'layer:primitive',
      'effect:cyanotype',
      'effect:neonGlow',
      'merge',
      'layer:text',
      'effect:vignette',
    ],
  },
  {
    id: 'print-damage',
    label: 'Print Damage',
    hint: 'paper / halftone / tear / dust',
    actions: ['noisePreset:paper', 'layer:text', 'effect:halftone', 'effect:tear', 'effect:grain', 'effect:threshold'],
  },
] as const;

const EFFECT_SEARCH_TERMS: Partial<Record<EffectPreset, string>> = {
  duotone: 'photo tone color image recipe',
  grain: 'paper dust texture print finish',
  scanlines: 'crt print line signal texture',
  risoShift: 'registration misregister print sticker grid',
  overprint: 'ink pressure print sticker',
  cyanotype: 'blue image wash primitive',
  neonGlow: 'glow halo primitive light',
  vignette: 'frame falloff focus image',
  halftone: 'print dots poster damage',
  tear: 'rip paper damage glitch',
  threshold: 'black white damage print cutoff',
};

export function NodeAddMenu({ x, y, onAdd, onClose, menuRef }: PaneMenuProps) {
  const [query, setQuery] = useState('');
  const [activeRecipeId, setActiveRecipeId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const mobileSheet = typeof window !== 'undefined' && window.innerWidth <= 640;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const groups = useMemo(() => ADD_GROUPS.map((g) => ({ ...g, items: ADD_ITEMS.filter((i) => i.group === g.id) })), []);

  const activeRecipe = RECIPE_FILTERS.find((recipe) => recipe.id === activeRecipeId) ?? null;

  const recipeResults = useMemo(() => {
    if (!activeRecipe) return [];
    return activeRecipe.actions
      .map((token) => ADD_ITEMS.find((item) => actionToken(item.action) === token))
      .filter((item): item is AddItem => Boolean(item))
      .map((item) => ({
        ...item,
        groupLabel: ADD_GROUPS.find((g) => g.id === item.group)?.label ?? '',
      }));
  }, [activeRecipe]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const tokens = q.split(/\s+/).filter(Boolean);
    return ADD_ITEMS.map((item) => ({ item, score: itemSearchScore(item, tokens) }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
      .map(({ item }) => ({
        ...item,
        groupLabel: ADD_GROUPS.find((g) => g.id === item.group)?.label ?? '',
      }));
  }, [query]);

  const isSearching = !!query.trim();
  const firstResult = searchResults[0] ?? recipeResults[0];

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
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveRecipeId(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              if (query || activeRecipeId) {
                setQuery('');
                setActiveRecipeId(null);
              } else onClose();
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

      <div className="nadd-recipes" aria-label="Recipe node groups">
        {RECIPE_FILTERS.map((recipe) => (
          <NoPan
            key={recipe.id}
            as="button"
            type="button"
            className={`nadd-recipe${activeRecipeId === recipe.id ? ' nadd-recipe-active' : ''}`}
            title={recipe.hint}
            aria-pressed={activeRecipeId === recipe.id}
            onClick={() => {
              setQuery('');
              setActiveRecipeId((current) => (current === recipe.id ? null : recipe.id));
            }}
          >
            {recipe.label}
          </NoPan>
        ))}
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
                description={item.description}
                action={item.action}
                onAdd={handleAdd}
              />
            ))
          )
        ) : activeRecipe ? (
          <div className="nadd-section">
            <div className="nadd-section-header">
              <span>{activeRecipe.label}</span>
              <small>{activeRecipe.hint}</small>
            </div>
            {recipeResults.map((item) => (
              <AddRow
                key={`${activeRecipe.id}-${item.label}`}
                symbol={item.symbol}
                label={item.label}
                tag={item.groupLabel}
                description={item.description}
                action={item.action}
                onAdd={handleAdd}
              />
            ))}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.id} className="nadd-section">
              <div className="nadd-section-header">
                <span>{group.label}</span>
                <small>{group.hint}</small>
              </div>
              {group.items.map((item) => (
                <AddRow
                  key={item.label}
                  symbol={item.symbol}
                  label={item.label}
                  description={item.description}
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
  description,
  action,
  onAdd,
}: {
  symbol: string;
  label: string;
  tag?: string;
  description: string;
  action: AddAction;
  onAdd: (a: AddAction) => void;
}) {
  return (
    <NoPan as="button" type="button" className="nadd-row" onClick={() => onAdd(action)}>
      <span className="nadd-row-symbol" style={{ color: itemColor(action) }}>
        {symbol}
      </span>
      <span className="nadd-row-copy">
        <span className="nadd-row-label">{label}</span>
        <span className="nadd-row-desc">{description}</span>
      </span>
      {tag && <span className="nadd-row-tag">{tag}</span>}
    </NoPan>
  );
}

function actionToken(action: AddAction) {
  if (action.kind === 'layer') return `layer:${action.layerKind}`;
  if (action.kind === 'effect') return `effect:${action.preset}`;
  if (action.kind === 'noisePreset') return `noisePreset:${action.preset}`;
  if (action.kind === 'arrayPreset') return `arrayPreset:${action.preset}`;
  if (action.kind === 'repeatPreset') return `repeatPreset:${action.preset}`;
  return action.kind;
}

function itemSearchText(item: AddItem) {
  const group = ADD_GROUPS.find((g) => g.id === item.group);
  return [
    item.label,
    item.description,
    item.symbol,
    item.group,
    group?.label,
    group?.hint,
    group?.description,
    actionToken(item.action),
    extraSearchTerms(item.action),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function itemSearchScore(item: AddItem, tokens: string[]) {
  const label = item.label.toLowerCase();
  const text = itemSearchText(item);
  return tokens.reduce((score, token) => {
    if (!text.includes(token)) return score;
    return score + (label.startsWith(token) ? 2 : label.includes(token) ? 1 : 1);
  }, 0);
}

function extraSearchTerms(action: AddAction) {
  if (action.kind === 'aiImage') return 'ai image generate generation prompt openai xai account asset source photo';
  if (action.kind === 'layer') {
    return {
      fill: 'background base plate color wash poster photo type texture recipe',
      image: 'photo picture cover upload scan artwork type recipe',
      text: 'photo type title headline typography caption label recipe',
      emoji: 'glyph scatter symbol icon',
      primitive: '3d object shape cylinder sphere cube image branch',
      noise: 'texture paper grain static concrete source',
      array: 'motif sticker grid pattern repeated marks',
    }[action.layerKind];
  }
  if (action.kind === 'effect') {
    return EFFECT_SEARCH_TERMS[action.preset] ?? '';
  }
  if (action.kind === 'noisePreset') return 'texture paper grain static source recipe';
  if (action.kind === 'arrayPreset') return 'motif sticker grid orbit shard pattern recipe';
  if (action.kind === 'repeatPreset') return 'motif sticker grid echo orbit repeat recipe';
  if (action.kind === 'merge') return 'blend combine branches graph recipe';
  if (action.kind === 'color') return 'grade tone contrast saturation hue';
  if (action.kind === 'repeat') return 'repeat motif grid line radial branch';
  return '';
}

function itemColor(action: AddAction) {
  if (action.kind === 'aiImage') return KIND_COLOR.image;
  return KIND_COLOR[
    action.kind === 'layer'
      ? action.layerKind
      : action.kind === 'effect'
        ? 'effect'
        : action.kind === 'noisePreset'
          ? 'noise'
          : action.kind === 'arrayPreset'
            ? 'array'
            : action.kind === 'repeatPreset'
              ? 'repeat'
              : action.kind
  ];
}
