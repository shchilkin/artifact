import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import {
  ADD_LIBRARY_ITEMS,
  ADD_LIBRARY_RECIPES,
  addLibraryGroupsForSurface,
  addLibraryItemsForSurface,
  addLibraryRecipesForSurface,
  parseAddLibraryAction,
  searchAddLibraryItems,
  serializeAddLibraryAction,
} from './addLibraryModel';

describe('addLibraryModel', () => {
  it('represents every effect preset in the shared add library', () => {
    const effectIds = new Set(ADD_LIBRARY_ITEMS.filter((item) => item.action.kind === 'effect').map((item) => item.id));

    for (const preset of EFFECT_PRESET_MENU_ORDER) {
      expect(effectIds.has(`effect:${preset}`)).toBe(true);
    }
  });

  it('keeps layers focused on stack-safe add actions', () => {
    const layerItems = addLibraryItemsForSurface('layers');
    expect(layerItems.length).toBeGreaterThan(0);
    expect(layerItems.every((item) => item.action.kind === 'layer' || item.action.kind === 'effect')).toBe(true);
    expect(layerItems.map((item) => item.id)).toContain('effect:pixelate');
    expect(layerItems.map((item) => item.id)).not.toContain('merge');
  });

  it('keeps node recipes valid and node-only', () => {
    const nodeItemIds = new Set(addLibraryItemsForSurface('nodes').map((item) => item.id));

    expect(addLibraryRecipesForSurface('layers')).toEqual([]);
    expect(addLibraryRecipesForSurface('nodes')).toEqual(ADD_LIBRARY_RECIPES);
    for (const recipe of ADD_LIBRARY_RECIPES) {
      expect(recipe.itemIds.every((id) => nodeItemIds.has(id))).toBe(true);
    }
  });

  it('exposes only groups that are available on each surface', () => {
    const layerGroups = addLibraryGroupsForSurface('layers').map((group) => group.id);
    const nodeGroups = addLibraryGroupsForSurface('nodes').map((group) => group.id);

    expect(layerGroups).toContain('content');
    expect(layerGroups).toContain('tone');
    expect(layerGroups).not.toContain('utility');
    expect(nodeGroups).toContain('utility');
    expect(nodeGroups).toContain('source');
  });

  it('marks common creative starts as popular', () => {
    const popularIds = ADD_LIBRARY_ITEMS.filter((item) => item.popular).map((item) => item.id);

    expect(popularIds).toEqual(
      expect.arrayContaining(['layer:image', 'layer:text', 'effect:grain', 'effect:pixelate']),
    );
  });

  it('uses creative metadata for search intent queries', () => {
    const items = addLibraryItemsForSurface('nodes');
    const firstIdsFor = (query: string) =>
      searchAddLibraryItems(items, query)
        .slice(0, 4)
        .map((item) => item.id);

    expect(firstIdsFor('low res')).toContain('effect:pixelate');
    expect(firstIdsFor('dots')).toContain('effect:halftone');
    expect(firstIdsFor('old photo')).toEqual(expect.arrayContaining(['effect:grain', 'effect:duotone']));
    expect(firstIdsFor('crt')).toEqual(expect.arrayContaining(['effect:scanlines', 'effect:vhsTracking']));
    expect(firstIdsFor('paper')).toContain('effect:grain');
  });

  it('gives key effect items individual descriptions and use-case tags', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:pixelate')?.description).toContain('block size');
    expect(itemsById.get('effect:splitTone')?.description).toContain('shadows');
    expect(itemsById.get('effect:grain')?.tags).toEqual(expect.arrayContaining(['texture', 'paper']));
    expect(itemsById.get('effect:halftone')?.tags).toEqual(expect.arrayContaining(['print', 'dots']));
  });

  it('round trips drag actions and rejects unknown payloads', () => {
    const action = { kind: 'effect' as const, preset: 'pixelate' as const };

    expect(parseAddLibraryAction(serializeAddLibraryAction(action))).toEqual(action);
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'effect', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction('not json')).toBeNull();
  });
});
