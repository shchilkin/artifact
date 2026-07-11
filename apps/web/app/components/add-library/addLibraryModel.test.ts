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

  it('offers a shader material recipe with single-purpose nodes for the material bridge workflow', () => {
    const recipe = ADD_LIBRARY_RECIPES.find((item) => item.id === 'shader-material');

    expect(recipe).toMatchObject({
      label: 'Shader Material',
      hint: 'shader fill / material maps / primitive',
      surfaces: ['nodes'],
    });
    expect(recipe?.itemIds).toEqual(
      expect.arrayContaining([
        'shader:mesh',
        'material',
        'layer:primitive',
        'effect:gradientMap',
        'effect:patternRefraction',
      ]),
    );
  });

  it('exposes AI Shader Effect as a prompt-ready input-driven shader node', () => {
    const item = addLibraryItemsForSurface('nodes').find((entry) => entry.id === 'shader:ai');

    expect(item).toMatchObject({
      label: 'AI Shader Effect',
      action: { kind: 'shader', shaderKind: 'aiShader', role: 'effect' },
      group: 'shaderEffect',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction(item!.action))).toEqual({
      kind: 'shader',
      shaderKind: 'aiShader',
      role: 'effect',
    });
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'shader', shaderKind: 'rawCode', role: 'fill' }))).toBeNull();
  });

  it('exposes Code Shader as an editable GLSL shader node', () => {
    const item = addLibraryItemsForSurface('nodes').find((entry) => entry.id === 'shader:code');

    expect(item).toMatchObject({
      label: 'Code Shader',
      action: { kind: 'shader', shaderKind: 'customCode', role: 'fill' },
      group: 'shaderFill',
    });
    expect(parseAddLibraryAction(serializeAddLibraryAction(item!.action))).toEqual({
      kind: 'shader',
      shaderKind: 'customCode',
      role: 'fill',
    });
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
    expect(nodeGroups).toContain('shaderFill');
    expect(nodeGroups).toContain('shaderEffect');
    expect(nodeGroups).toContain('material');
    expect(nodeGroups).toContain('primitive');
    expect(nodeIds).toEqual(
      expect.arrayContaining([
        'merge',
        'color',
        'mask',
        'transform',
        'grimeShadow',
        'scene3d',
        'environment',
        'shader:mesh',
        'shader:ai',
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
    expect(firstIdsFor('bad stream')).toContain('effect:badStream');
    expect(firstIdsFor('macroblock')).toContain('effect:badStream');
    expect(firstIdsFor('macroblock')).toContain('effect:macroblocks');
    expect(firstIdsFor('detail blocks')).toContain('effect:detailBlocks');
    expect(firstIdsFor('block smear')).toContain('effect:blockSmear');
    expect(firstIdsFor('chroma blocks')).toContain('effect:chromaBlocks');
    expect(firstIdsFor('block dropout')).toContain('effect:blockDropout');
    expect(firstIdsFor('headline')).toContain('textPreset:title');
    expect(firstIdsFor('credit')).toContain('textPreset:credit');
    expect(firstIdsFor('dots')).toContain('effect:halftone');
    expect(firstIdsFor('dot grain')).toContain('effect:dotGrain');
    expect(firstIdsFor('mesh shader')).toContain('shader:mesh');
    expect(firstIdsFor('shader fill')).toContain('shader:mesh');
    expect(firstIdsFor('stipple')).toContain('effect:dotGrain');
    expect(firstIdsFor('old photo')).toEqual(expect.arrayContaining(['effect:grain', 'effect:duotone']));
    expect(firstIdsFor('old game')).toEqual(expect.arrayContaining(['effect:dotGrain', 'effect:indexedPalette']));
    expect(firstIdsFor('ps1')).toEqual(expect.arrayContaining(['effect:dotGrain', 'effect:indexedPalette']));
    expect(firstIdsFor('retro resolution')).toContain('effect:retroResolution');
    expect(firstIdsFor('indexed palette')).toContain('effect:indexedPalette');
    expect(firstIdsFor('gradient map')).toContain('effect:gradientMap');
    expect(firstIdsFor('channel mixer')).toContain('effect:channelMixer');
    expect(firstIdsFor('bokeh blur')).toContain('effect:bokehBlur');
    expect(firstIdsFor('hatching')).toContain('effect:hatching');
    expect(firstIdsFor('pattern refraction')).toContain('effect:patternRefraction');
    expect(firstIdsFor('pixel stretch')).toContain('effect:pixelStretch');
    expect(firstIdsFor('gooey merge')).toContain('effect:gooeyMerge');
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

  it('gives key effect items individual descriptions', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:pixelate')?.description).toContain('block size');
    expect(itemsById.get('effect:splitTone')?.description).toContain('shadows');
    expect(itemsById.get('effect:dotGrain')?.description).toContain('stipple');
    expect(itemsById.get('effect:retroResolution')?.description).toContain('export');
    expect(itemsById.get('effect:badStream')?.description).toContain('macroblocks');
    expect(itemsById.get('effect:macroblocks')?.description).toContain('Large');
    expect(itemsById.get('effect:detailBlocks')?.description).toContain('Small');
    expect(itemsById.get('effect:indexedPalette')?.description).toContain('swatches');
    expect(itemsById.get('effect:gradientMap')?.description).toContain('luminance');
    expect(itemsById.get('effect:channelMixer')?.description).toContain('RGB channels');
    expect(itemsById.get('effect:bokehBlur')?.description).toContain('highlight');
    expect(itemsById.get('effect:hatching')?.description).toContain('hatch');
    expect(itemsById.get('effect:patternRefraction')?.description).toContain('Refracts');
    expect(itemsById.get('effect:pixelStretch')?.description).toContain('streaks');
    expect(itemsById.get('effect:gooeyMerge')?.description).toContain('blobs');
    expect(itemsById.get('effect:edgeCrush')?.description).toContain('alpha');
    expect(itemsById.get('effect:silhouetteCrush')?.description).toContain('sprite');
  });

  it('gives key effect items use-case tags', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:grain')?.tags).toEqual(expect.arrayContaining(['texture', 'paper']));
    expect(itemsById.get('effect:dotGrain')?.tags).toEqual(expect.arrayContaining(['texture', 'dots']));
    expect(itemsById.get('effect:retroResolution')?.tags).toEqual(expect.arrayContaining(['tone', 'low-res']));
    expect(itemsById.get('effect:badStream')?.tags).toEqual(expect.arrayContaining(['signal', 'compression']));
    expect(itemsById.get('effect:macroblocks')?.tags).toEqual(expect.arrayContaining(['signal', 'blocks']));
    expect(itemsById.get('effect:blockDropout')?.tags).toEqual(expect.arrayContaining(['signal', 'damage']));
    expect(itemsById.get('effect:indexedPalette')?.tags).toEqual(expect.arrayContaining(['tone', 'palette']));
    expect(itemsById.get('effect:gradientMap')?.tags).toEqual(expect.arrayContaining(['tone', 'shader']));
    expect(itemsById.get('effect:channelMixer')?.tags).toEqual(expect.arrayContaining(['tone', 'channels']));
    expect(itemsById.get('effect:bokehBlur')?.tags).toEqual(expect.arrayContaining(['graphic', 'lens']));
    expect(itemsById.get('effect:hatching')?.tags).toEqual(expect.arrayContaining(['graphic', 'line']));
    expect(itemsById.get('effect:patternRefraction')?.tags).toEqual(expect.arrayContaining(['warp', 'shader']));
    expect(itemsById.get('effect:pixelStretch')?.tags).toEqual(expect.arrayContaining(['signal', 'smear']));
    expect(itemsById.get('effect:gooeyMerge')?.tags).toEqual(expect.arrayContaining(['graphic', 'blob']));
    expect(itemsById.get('effect:halftone')?.tags).toEqual(expect.arrayContaining(['print', 'dots']));
    expect(itemsById.get('effect:edgeCrush')?.tags).toEqual(expect.arrayContaining(['graphic', 'alpha']));
    expect(itemsById.get('effect:silhouetteCrush')?.tags).toEqual(expect.arrayContaining(['graphic', 'edges']));
  });

  it('keeps v0.36 retro effects in intentional browse groups', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('effect:dotGrain')?.group).toBe('texture');
    expect(itemsById.get('effect:badStream')?.group).toBe('signal');
    expect(itemsById.get('effect:macroblocks')?.group).toBe('signal');
    expect(itemsById.get('effect:detailBlocks')?.group).toBe('signal');
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

  it('keeps 3D primitives, models, scenes, and environments in the 3D / Primitive browse group', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));

    expect(itemsById.get('layer:primitive')?.group).toBe('primitive');
    expect(itemsById.get('layer:model')?.group).toBe('primitive');
    expect(itemsById.get('scene3d')?.group).toBe('primitive');
    expect(itemsById.get('environment')?.group).toBe('primitive');
    expect(itemsById.get('material')?.group).toBe('material');
  });

  it('keeps standalone procedural shaders in the Shader Fills group', () => {
    const itemsById = new Map(ADD_LIBRARY_ITEMS.map((item) => [item.id, item]));
    const shaderFillGroup = ADD_LIBRARY_ITEMS.find((item) => item.id === 'shader:mesh')?.group;

    expect(shaderFillGroup).toBe('shaderFill');
    expect(itemsById.get('shader:mesh')?.label).toBe('Shader Fill');
    expect(itemsById.get('shader:mesh')?.description).toContain('standalone procedural texture');
    expect(itemsById.get('shader:mesh')?.tags).toEqual(expect.arrayContaining(['source', 'shader', 'fill']));
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
    expect(parseAddLibraryAction(serializeAddLibraryAction({ kind: 'shader', role: 'fill' }))).toEqual({
      kind: 'shader',
      role: 'fill',
    });
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'effect', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'textPreset', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction(JSON.stringify({ kind: 'material', preset: 'not-real' }))).toBeNull();
    expect(parseAddLibraryAction('not json')).toBeNull();
  });
});
