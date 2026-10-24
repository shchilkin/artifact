import { describe, expect, it } from 'vitest';

import {
  makeEffectPresetLayer,
  makeEmojiLayer,
  makeFillLayer,
  makeImageLayer,
  makeSourceLayer,
  makeTextLayer,
} from '../../../types/config';
import { makeDefaultCodeShaderInstance } from '../../../utils/customShaderCode';
import { makeGraphMaterialNode, makeGraphShaderNode } from '../../../utils/nodeKinds';
import { edgeRenderSig, graphNodeRenderSig, layerRenderSig } from '../../../utils/renderSignature';

describe('layerRenderSig', () => {
  it('ignores layer identity and editor-only metadata', () => {
    const base = makeTextLayer({
      id: 'text-1',
      name: 'Title',
      locked: false,
      content: 'ARTIFACT',
    });
    const renamed = {
      ...base,
      id: 'text-2',
      name: 'Renamed title',
      locked: true,
    };

    expect(layerRenderSig(renamed)).toBe(layerRenderSig(base));
  });

  it('changes when text render fields change', () => {
    const base = makeTextLayer({ content: 'ARTIFACT' });
    const edited = { ...base, content: 'SIGNAL' };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('changes when fill render fields change', () => {
    const base = makeFillLayer({ color: '#ff0000' });
    const edited = { ...base, color: '#00ff00' };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('ignores AI image generation provenance for image layers', () => {
    const base = makeImageLayer('artifact-asset://generated', {
      aiGeneration: { prompt: 'misty album cover' },
    });
    const edited = {
      ...base,
      aiGeneration: { prompt: 'different provenance note', provider: 'openai' },
    };

    expect(layerRenderSig(edited)).toBe(layerRenderSig(base));
  });

  it('ignores editor-only metadata for effect layers', () => {
    const base = makeEffectPresetLayer('grain', {
      id: 'effect-1',
      name: 'Effect',
      locked: false,
      grain: 20,
    });
    const renamed = {
      ...base,
      id: 'effect-2',
      name: 'Renamed effect',
      locked: true,
    };

    expect(layerRenderSig(renamed)).toBe(layerRenderSig(base));
  });

  it('keeps procedural render fields in the signature', () => {
    const base = makeSourceLayer('primitive', { primitiveDepth: 30 });
    const edited = { ...base, primitiveDepth: 70 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('keeps line field render fields in the signature', () => {
    const base = makeSourceLayer('lineField', { lineFieldStrength: 0 });
    const edited = { ...base, lineFieldStrength: 42 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('ignores line field placement fields because line fields render full-frame', () => {
    const base = makeSourceLayer('lineField');
    const edited = { ...base, x: 0.2, y: 0.7, scaleX: 0.25, scaleY: 0.3, rotation: 35 };

    expect(layerRenderSig(edited)).toBe(layerRenderSig(base));
  });

  it('changes when emoji seed offset changes', () => {
    const base = makeEmojiLayer({ seedOffset: 0 });
    const edited = { ...base, seedOffset: 12 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });

  it('changes when effect seed offset changes', () => {
    const base = makeEffectPresetLayer('grain', { seedOffset: 0 });
    const edited = { ...base, seedOffset: 12 };

    expect(layerRenderSig(edited)).not.toBe(layerRenderSig(base));
  });
});

describe('graph node render signatures', () => {
  it('ignores merge node identity and name', () => {
    const base = { kind: 'merge' as const, id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 };
    const renamed = { ...base, id: 'merge-2', name: 'Renamed merge' };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
  });

  it('changes when merge render fields change', () => {
    const base = { kind: 'merge' as const, id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 };
    const edited = { ...base, opacity: 50 };

    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('changes when a graph node is hidden', () => {
    const base = { kind: 'merge' as const, id: 'merge-1', name: 'Merge', blendMode: 'source-over', opacity: 100 };

    expect(graphNodeRenderSig({ ...base, hidden: true })).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores color node identity and name', () => {
    const base = {
      kind: 'color' as const,
      id: 'color-1',
      name: 'Color',
      contrast: 100,
      brightness: 100,
      saturation: 100,
      hue: 0,
    };
    const renamed = { ...base, id: 'color-2', name: 'Renamed color' };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
  });

  it('changes when color render fields change', () => {
    const base = {
      kind: 'color' as const,
      id: 'color-1',
      name: 'Color',
      contrast: 100,
      brightness: 100,
      saturation: 100,
      hue: 0,
    };
    const edited = { ...base, hue: 45 };

    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores repeat node identity and changes for repeat fields', () => {
    const base = {
      kind: 'repeat' as const,
      id: 'repeat-1',
      name: 'Repeater',
      pattern: 'grid' as const,
      count: 4,
      rows: 3,
      gap: 24,
      radius: 80,
      scale: 50,
      jitter: 0,
      rotation: 0,
      seedOffset: 0,
      opacity: 100,
      blendMode: 'source-over',
    };
    const renamed = { ...base, id: 'repeat-2', name: 'Renamed repeat' };
    const edited = { ...base, rotationMode: 'step' as const, rotationStep: 22 };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores shader node identity and changes for procedural fields', () => {
    const base = makeGraphShaderNode({ id: 'shader-1', name: 'Mesh Shader', distortion: 24 });
    const renamed = { ...base, id: 'shader-2', name: 'Renamed shader' };
    const edited = { ...base, distortion: 68 };
    const composited = { ...base, opacity: 42 };
    const custom = makeGraphShaderNode({
      ...base,
      shaderKind: 'aiShader',
      shaderInstance: {
        definition: {
          version: 1,
          id: 'ai-definition',
          label: 'AI Refraction',
          language: 'glsl-fragment',
          code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv + u_prop_amount); }',
          properties: [
            { key: 'amount', label: 'Amount', type: 'number', default: 0.02, min: 0, max: 0.1, step: 0.001 },
          ],
          provenance: { source: 'openai', prompt: 'Refraction', model: 'test-model' },
        },
        values: { amount: 0.02 },
      },
    });
    const customEdited = {
      ...custom,
      shaderInstance: {
        ...custom.shaderInstance!,
        values: { amount: 0.06 },
      },
    };
    const code = makeGraphShaderNode({
      id: 'code-shader',
      shaderKind: 'customCode',
      shaderInstance: {
        ...makeDefaultCodeShaderInstance('code-shader'),
        definition: {
          ...makeDefaultCodeShaderInstance('code-shader').definition,
          code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
        },
      },
    });
    const codeEdited = makeGraphShaderNode({
      id: 'code-shader',
      shaderKind: 'customCode',
      shaderInstance: {
        ...makeDefaultCodeShaderInstance('code-shader'),
        definition: {
          ...makeDefaultCodeShaderInstance('code-shader').definition,
          code: 'vec4 mainImage(vec2 uv) { return vec4(uv, 0.0, 1.0); }',
        },
      },
    });
    const promptEdited = {
      ...custom,
      aiPrompt: 'A different prompt with the same rendered shader',
      shaderInstance: {
        ...custom.shaderInstance!,
        definition: {
          ...custom.shaderInstance!.definition,
          label: 'Renamed result',
          provenance: { source: 'openai' as const, prompt: 'Different prompt', model: 'another-model' },
        },
      },
    };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(composited)).not.toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(customEdited)).not.toBe(graphNodeRenderSig(custom));
    expect(graphNodeRenderSig(promptEdited)).toBe(graphNodeRenderSig(custom));
    expect(graphNodeRenderSig(codeEdited)).not.toBe(graphNodeRenderSig(code));
  });

  it('ignores mask node identity and changes for mask fields', () => {
    const base = {
      kind: 'mask' as const,
      id: 'mask-1',
      name: 'Mask',
      mode: 'alpha' as const,
      invert: false,
      threshold: 50,
      feather: 0,
      expand: 0,
      opacity: 100,
    };
    const renamed = { ...base, id: 'mask-2', name: 'Renamed mask' };
    const edited = { ...base, mode: 'threshold' as const, threshold: 65 };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores transform node identity and changes for transform fields', () => {
    const base = {
      kind: 'transform' as const,
      id: 'transform-1',
      name: 'Transform',
      x: 0,
      y: 0,
      scaleX: 100,
      scaleY: 100,
      uniformScale: true,
      rotation: 0,
      pivotMode: 'canvas' as const,
      opacity: 100,
    };
    const renamed = { ...base, id: 'transform-2', name: 'Renamed transform' };
    const edited = { ...base, x: 18, rotation: 45 };
    const scaleLockChanged = { ...base, uniformScale: false };
    const pivotChanged = { ...base, pivotMode: 'visible' as const };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(scaleLockChanged)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(pivotChanged)).not.toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores grime shadow node identity and changes for render fields', () => {
    const base = {
      kind: 'grimeShadow' as const,
      id: 'shadow-1',
      name: 'Grime Shadow',
      x: 8,
      y: 10,
      layers: 5,
      blur: 10,
      spread: 14,
      grime: 45,
      jitter: 10,
      opacity: 58,
      color: '#090606',
      seedOffset: 0,
      shadowOnly: false,
    };
    const renamed = { ...base, id: 'shadow-2', name: 'Renamed shadow' };
    const edited = { ...base, grime: 80, shadowOnly: true };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('ignores environment node identity and changes for render fields', () => {
    const base = {
      kind: 'environment' as const,
      id: 'env-1',
      name: 'Environment Map',
      environmentSrc: 'artifact-env://env-a',
      environmentName: 'studio.exr',
      environmentMime: 'image/x-exr',
      environmentBytes: 1024,
    };
    const renamed = { ...base, id: 'env-2', name: 'Renamed environment' };
    const edited = { ...base, environmentSrc: 'artifact-env://env-b', environmentBytes: 2048 };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });

  it('changes material node signatures when PBR texture sources change', () => {
    const base = makeGraphMaterialNode({
      id: 'material-1',
      name: 'Material',
      materialAlbedoSrc: 'artifact-asset://albedo-a',
    });
    const renamed = { ...base, id: 'material-2', name: 'Renamed material' };
    const edited = { ...base, materialAlbedoSrc: 'artifact-asset://albedo-b' };

    expect(graphNodeRenderSig(renamed)).toBe(graphNodeRenderSig(base));
    expect(graphNodeRenderSig(edited)).not.toBe(graphNodeRenderSig(base));
  });
});

describe('edgeRenderSig', () => {
  it('ignores edge id but changes for topology', () => {
    const base = { id: 'edge-1', fromId: 'fill-1', fromPort: 'out' as const, toId: 'text-1', toPort: 'bg' as const };
    const renamed = { ...base, id: 'edge-2' };
    const rerouted = { ...base, toPort: 'in' as const };

    expect(edgeRenderSig(renamed)).toBe(edgeRenderSig(base));
    expect(edgeRenderSig(rerouted)).not.toBe(edgeRenderSig(base));
  });
});
