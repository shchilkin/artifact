import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import {
  ADD_LIBRARY_ITEMS,
  ADD_LIBRARY_RECIPES,
  addLibraryItemsForSurface,
  addLibraryRecipesForSurface,
  parseAddLibraryAction,
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

  it('marks common creative starts as popular', () => {
    const popularIds = ADD_LIBRARY_ITEMS.filter((item) => item.popular).map((item) => item.id);

    expect(popularIds).toEqual(
      expect.arrayContaining(['layer:image', 'layer:text', 'effect:grain', 'effect:pixelate']),
    );
  });

  it('round trips drag actions and rejects unknown payloads', () => {
    const action = { kind: 'effect' as const, preset: 'pixelate' as const };

    expect(parseAddLibraryAction(serializeAddLibraryAction(action))).toEqual(action);
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'effect', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction('not json')).toBeNull();
  });
});
