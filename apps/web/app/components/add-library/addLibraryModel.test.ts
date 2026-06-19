import { describe, expect, it } from 'vitest';

import { EFFECT_PRESET_MENU_ORDER } from '../../types/config';
import {
  ADD_LIBRARY_ITEMS,
  ADD_LIBRARY_RECIPES,
  addLibraryBrowseItemsForSurface,
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

  it('keeps layers focused on layer-safe library actions', () => {
    const layerItems = addLibraryItemsForSurface('layers');
    expect(layerItems.length).toBeGreaterThan(0);
    expect(
      layerItems.every(
        (item) =>
          item.action.kind === 'layer' ||
          item.action.kind === 'textPreset' ||
          item.action.kind === 'noisePreset' ||
          item.action.kind === 'arrayPreset' ||
          item.action.kind === 'aiImage' ||
          item.action.kind === 'scene3d' ||
          item.action.kind === 'effect',
      ),
    ).toBe(true);
    expect(layerItems.map((item) => item.id)).toContain('effect:pixelate');
    expect(layerItems.map((item) => item.id)).toContain('textPreset:title');
    expect(layerItems.map((item) => item.id)).toContain('aiImage');
    expect(layerItems.map((item) => item.id)).toContain('scene3d');
    expect(layerItems.map((item) => item.id)).not.toContain('layer:model');
    expect(layerItems.map((item) => item.id)).toContain('noisePreset:paper');
    expect(layerItems.map((item) => item.id)).toContain('arrayPreset:stickerGrid');
    expect(layerItems.map((item) => item.id)).toContain('layer:lineField');
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
    const nodeIds = addLibraryItemsForSurface('nodes').map((item) => item.id);

    expect(layerGroups).toContain('content');
    expect(layerGroups).toContain('tone');
    expect(layerGroups).not.toContain('utility');
    expect(nodeGroups).toContain('utility');
    expect(nodeGroups).toContain('source');
    expect(nodeGroups).toContain('material');
    expect(nodeIds).toEqual(
      expect.arrayContaining([
        'merge',
        'color',
        'mask',
        'transform',
        'grimeShadow',
        'scene3d',
        'environment',
        'material',
        'repeat',
      ]),
    );
    expect(nodeIds).not.toContain('material:chrome');
  });

  it('keeps preset variants searchable without showing them as top-level browse primitives', () => {
    const layerBrowseIds = addLibraryBrowseItemsForSurface('layers').map((item) => item.id);
    const nodeBrowseIds = addLibraryBrowseItemsForSurface('nodes').map((item) => item.id);
    const visiblePopularIds = ADD_LIBRARY_ITEMS.filter((item) => item.popular && item.showInBrowse !== false).map(
      (item) => item.id,
    );

    expect(layerBrowseIds).toContain('layer:text');
    expect(layerBrowseIds).not.toContain('textPreset:title');
    expect(nodeBrowseIds).not.toContain('textPreset:poster');
    expect(visiblePopularIds).toEqual(expect.arrayContaining(['layer:image', 'layer:text', 'effect:grain']));
    expect(visiblePopularIds).not.toContain('textPreset:title');
  });

  it('uses creative metadata for search intent queries', () => {
    const items = addLibraryItemsForSurface('nodes');
    const firstIdsFor = (query: string) =>
      searchAddLibraryItems(items, query)
        .slice(0, 4)
        .map((item) => item.id);

    expect(firstIdsFor('low res')).toContain('effect:pixelate');
    expect(firstIdsFor('headline')).toContain('textPreset:title');
    expect(firstIdsFor('credit')).toContain('textPreset:credit');
    expect(firstIdsFor('dots')).toContain('effect:halftone');
    expect(firstIdsFor('dot grain')).toContain('effect:dotGrain');
    expect(firstIdsFor('stipple')).toContain('effect:dotGrain');
    expect(firstIdsFor('old photo')).toEqual(expect.arrayContaining(['effect:grain', 'effect:duotone']));
    expect(firstIdsFor('old game')).toEqual(expect.arrayContaining(['effect:dotGrain', 'effect:indexedPalette']));
    expect(firstIdsFor('ps1')).toEqual(expect.arrayContaining(['effect:dotGrain', 'effect:indexedPalette']));
    expect(firstIdsFor('retro resolution')).toContain('effect:retroResolution');
    expect(firstIdsFor('indexed palette')).toContain('effect:indexedPalette');
    expect(firstIdsFor('alpha crush')).toContain('effect:edgeCrush');
    expect(firstIdsFor('edge crush')).toContain('effect:silhouetteCrush');
    expect(firstIdsFor('silhouette crush')).toContain('effect:silhouetteCrush');
    expect(firstIdsFor('hard alpha')).toContain('effect:edgeCrush');
    expect(firstIdsFor('crt')).toEqual(expect.arrayContaining(['effect:scanlines', 'effect:vhsTracking']));
    expect(firstIdsFor('paper')).toContain('effect:grain');
    expect(firstIdsFor('line')).toContain('layer:lineField');
    expect(firstIdsFor('linefield')).toContain('layer:lineField');
    expect(firstIdsFor('contour')).toContain('layer:lineField');
    expect(firstIdsFor('glb model')).toContain('layer:model');
    expect(firstIdsFor('pbr')).toContain('material');
    expect(firstIdsFor('material')).toContain('material');
    expect(firstIdsFor('chrome material')).toContain('material');
    expect(firstIdsFor('mask')).toContain('mask');
    expect(firstIdsFor('matte')).toContain('mask');
    expect(firstIdsFor('alpha')).toContain('mask');
    expect(firstIdsFor('transform')).toContain('transform');
    expect(firstIdsFor('rotate')).toContain('transform');
    expect(firstIdsFor('scale')).toContain('transform');
    expect(firstIdsFor('grime shadow')).toContain('grimeShadow');
    expect(firstIdsFor('drop shadow')).toContain('grimeShadow');
    expect(firstIdsFor('dirty')).toContain('grimeShadow');
  });

  it('gives key effect items individual descriptions and use-case tags', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:pixelate')?.description).toContain('block size');
    expect(itemsById.get('effect:splitTone')?.description).toContain('shadows');
    expect(itemsById.get('effect:dotGrain')?.description).toContain('stipple');
    expect(itemsById.get('effect:retroResolution')?.description).toContain('export');
    expect(itemsById.get('effect:indexedPalette')?.description).toContain('swatches');
    expect(itemsById.get('effect:edgeCrush')?.description).toContain('alpha');
    expect(itemsById.get('effect:silhouetteCrush')?.description).toContain('sprite');
    expect(itemsById.get('effect:grain')?.tags).toEqual(expect.arrayContaining(['texture', 'paper']));
    expect(itemsById.get('effect:dotGrain')?.tags).toEqual(expect.arrayContaining(['texture', 'dots']));
    expect(itemsById.get('effect:retroResolution')?.tags).toEqual(expect.arrayContaining(['tone', 'low-res']));
    expect(itemsById.get('effect:indexedPalette')?.tags).toEqual(expect.arrayContaining(['tone', 'palette']));
    expect(itemsById.get('effect:halftone')?.tags).toEqual(expect.arrayContaining(['print', 'dots']));
    expect(itemsById.get('effect:edgeCrush')?.tags).toEqual(expect.arrayContaining(['graphic', 'alpha']));
    expect(itemsById.get('effect:silhouetteCrush')?.tags).toEqual(expect.arrayContaining(['graphic', 'edges']));
  });

  it('keeps v0.36 retro effects in intentional browse groups', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:dotGrain')?.group).toBe('texture');
    expect(itemsById.get('effect:retroResolution')?.group).toBe('tone');
    expect(itemsById.get('effect:indexedPalette')?.group).toBe('tone');
    expect(itemsById.get('effect:edgeCrush')?.group).toBe('graphic');
    expect(itemsById.get('effect:silhouetteCrush')?.group).toBe('graphic');
  });

  it('keeps PBR material nodes in the material browse group', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('material')?.group).toBe('material');
    expect(itemsById.get('material')?.action).toEqual({ kind: 'material' });
    expect(itemsById.get('material')?.tags).toEqual(expect.arrayContaining(['material', 'pbr']));
    expect(itemsById.has('material:goldFoil')).toBe(false);
    expect(itemsById.has('material:chrome')).toBe(false);
  });

  it('round trips drag actions and rejects unknown payloads', () => {
    const action = { kind: 'textPreset' as const, preset: 'poster' as const };

    expect(parseAddLibraryAction(serializeAddLibraryAction(action))).toEqual(action);
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'effect', preset: 'pixelate' }))).toEqual({
      kind: 'effect',
      preset: 'pixelate',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'noisePreset', preset: 'paper' }))).toEqual({
      kind: 'noisePreset',
      preset: 'paper',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'layer', layerKind: 'lineField' }))).toEqual({
      kind: 'layer',
      layerKind: 'lineField',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'material', preset: 'chrome' }))).toEqual({
      kind: 'material',
      preset: 'chrome',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'material' }))).toEqual({ kind: 'material' });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'mask' }))).toEqual({ kind: 'mask' });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'transform' }))).toEqual({ kind: 'transform' });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'grimeShadow' }))).toEqual({ kind: 'grimeShadow' });
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'environment' }))).toEqual({ kind: 'environment' });
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'effect', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'textPreset', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'material', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction('not json')).toBeNull();
  });
});
