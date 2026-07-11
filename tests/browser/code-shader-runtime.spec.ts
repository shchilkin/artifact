import { expect, test } from '@playwright/test';
import type { ShaderPropertyDefinition } from '../../apps/web/app/types/config';

test('preserves backdrop orientation through an identity Code Shader', async ({ page }) => {
  await page.goto('/');

  const corners = await page.evaluate(async () => {
    const shaderRuntime = await import('/app/utils/render/customCodeShader.ts');
    const backdrop = document.createElement('canvas');
    backdrop.width = 8;
    backdrop.height = 8;
    const context = backdrop.getContext('2d')!;
    context.fillStyle = '#ff0000';
    context.fillRect(0, 0, 4, 4);
    context.fillStyle = '#00ff00';
    context.fillRect(4, 0, 4, 4);
    context.fillStyle = '#0000ff';
    context.fillRect(0, 4, 4, 4);
    context.fillStyle = '#ffff00';
    context.fillRect(4, 4, 4, 4);

    const output = shaderRuntime.renderCustomCodeShaderNodeToCanvas(
      {
        shaderKind: 'customCode',
        role: 'effect',
        shaderInstance: {
          definition: {
            version: 1,
            id: 'identity-orientation',
            label: 'Identity orientation',
            language: 'glsl-fragment',
            code: 'vec4 mainImage(vec2 uv) { return texture2D(u_backdrop, uv); }',
            properties: [],
          },
          values: {},
        },
        palette: [],
        distortion: 0,
        scale: 100,
        seedOffset: 0,
      } as never,
      1171,
      8,
      8,
      backdrop,
    );
    const outputContext = output.getContext('2d')!;
    const read = (x: number, y: number) => Array.from(outputContext.getImageData(x, y, 1, 1).data);
    return {
      topLeft: read(1, 1),
      topRight: read(6, 1),
      bottomLeft: read(1, 6),
      bottomRight: read(6, 6),
    };
  });

  expect(corners).toEqual({
    topLeft: [255, 0, 0, 255],
    topRight: [0, 255, 0, 255],
    bottomLeft: [0, 0, 255, 255],
    bottomRight: [255, 255, 0, 255],
  });
});

test('renders Code Shader output before releasing disposable WebGL contexts', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const shaderRuntime = await import('/app/utils/render/customCodeShader.ts');
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    let webGlContexts = 0;
    let releasedContexts = 0;

    HTMLCanvasElement.prototype.getContext = function patchedGetContext(type: string, ...args: unknown[]) {
      const context = (originalGetContext as (...values: unknown[]) => RenderingContext | null).call(
        this,
        type,
        ...args,
      );
      if (type === 'webgl' && context instanceof WebGLRenderingContext) {
        webGlContexts += 1;
        const originalGetExtension = context.getExtension.bind(context);
        context.getExtension = ((name: string) => {
          const extension = originalGetExtension(name);
          if (name !== 'WEBGL_lose_context' || !extension) return extension;
          const loseContext = (extension as WEBGL_lose_context).loseContext.bind(extension);
          return {
            ...(extension as object),
            loseContext() {
              releasedContexts += 1;
              loseContext();
            },
          } as WEBGL_lose_context;
        }) as WebGLRenderingContext['getExtension'];
      }
      return context;
    } as typeof HTMLCanvasElement.prototype.getContext;

    const code = 'vec4 mainImage(vec2 uv) { return vec4(u_prop_tint * u_prop_amount * u_prop_enabled, 1.0); }';
    const properties: ShaderPropertyDefinition[] = [
      { key: 'amount', label: 'Amount', type: 'number', default: 0.25, min: 0, max: 1, step: 0.01 },
      { key: 'tint', label: 'Tint', type: 'color', default: '#ffffff' },
      { key: 'enabled', label: 'Enabled', type: 'boolean', default: true },
    ];
    try {
      const render = (enabled: boolean) =>
        shaderRuntime.renderCustomCodeShaderNodeToCanvas(
          {
            shaderKind: 'customCode',
            role: 'fill',
            shaderInstance: {
              definition: {
                version: 1,
                id: 'browser-code-shader',
                label: 'Browser Code Shader',
                language: 'glsl-fragment',
                code,
                properties,
              },
              values: { amount: 0.5, tint: '#ff0000', enabled },
            },
            palette: ['#ff705f', '#8d5cff', '#79e3c5', '#f6c96f'],
            distortion: 56,
            scale: 100,
            seedOffset: 0,
          } as never,
          1171,
          64,
          64,
        );
      const pixel = Array.from(render(true).getContext('2d')!.getImageData(32, 32, 1, 1).data);
      const disabledPixel = Array.from(render(false).getContext('2d')!.getImageData(32, 32, 1, 1).data);
      const diagnostics = shaderRuntime.compileCustomCodeShaderForDiagnostics(code, properties);
      const inactiveBackdrop = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        'vec4 mainImage(vec2 uv) { texture2D(u_backdrop, uv); return vec4(1.0); }',
        [],
        { requireBackdrop: true },
      );
      const inactiveProperty = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec4 source = texture2D(u_backdrop, uv);
          float ignored = u_prop_amount;
          return source;
        }`,
        [properties[0]!],
        { requireBackdrop: true, requirePropertyUniforms: true },
      );
      const warpControl = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec2 warpedUv = uv + vec2(sin(uv.y * 12.0) * u_prop_amount, 0.0);
          return texture2D(u_backdrop, clamp(warpedUv, 0.0, 1.0));
        }`,
        [{ key: 'amount', label: 'Amount', type: 'number', default: 0.025, min: 0, max: 0.12, step: 0.001 }],
        {
          requireBackdrop: true,
          requirePropertyUniforms: true,
          requirePropertyInfluence: true,
          requireVisualVariation: true,
        },
      );
      const transparentResult = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec4 source = texture2D(u_backdrop, uv);
          return vec4(source.rgb, 0.0);
        }`,
        [],
        { requireBackdrop: true, requireVisualVariation: true },
      );
      const flatResult = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec4 source = texture2D(u_backdrop, vec2(0.5));
          return vec4(source.rgb, 1.0);
        }`,
        [],
        { requireBackdrop: true, requireVisualVariation: true },
      );
      const inertProperty = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec4 source = texture2D(u_backdrop, uv);
          float unreachable = step(1000.0, u_prop_amount);
          return vec4(source.rgb + unreachable, source.a);
        }`,
        [{ key: 'amount', label: 'Amount', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01 }],
        { requireBackdrop: true, requirePropertyUniforms: true, requirePropertyInfluence: true },
      );
      const gatedControls = shaderRuntime.compileCustomCodeShaderForDiagnostics(
        `vec4 mainImage(vec2 uv) {
          vec4 source = texture2D(u_backdrop, uv);
          vec3 tinted = source.rgb * u_prop_tint;
          return vec4(mix(source.rgb, tinted, u_prop_enabled * u_prop_amount), source.a);
        }`,
        [
          { key: 'amount', label: 'Amount', type: 'number', default: 0, min: 0, max: 1, step: 0.01 },
          { key: 'enabled', label: 'Enabled', type: 'boolean', default: false },
          { key: 'tint', label: 'Tint', type: 'color', default: '#ff66aa' },
        ],
        { requireBackdrop: true, requirePropertyUniforms: true, requirePropertyInfluence: true },
      );
      return {
        diagnostics,
        disabledPixel,
        flatResult,
        gatedControls,
        inactiveBackdrop,
        inactiveProperty,
        inertProperty,
        pixel,
        releasedContexts,
        transparentResult,
        warpControl,
        webGlContexts,
      };
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(result.diagnostics).toEqual({ ok: true, message: null, stage: null });
  expect(result.pixel[3]).toBe(255);
  expect(result.pixel[0]).toBeGreaterThan(110);
  expect(result.pixel[0]).toBeLessThan(150);
  expect(result.pixel[1]).toBeLessThan(8);
  expect(result.pixel[2]).toBeLessThan(8);
  expect(result.disabledPixel.slice(0, 3)).toEqual([0, 0, 0]);
  expect(result.inactiveBackdrop).toEqual({
    ok: false,
    message: 'Use the connected image in the final shader result.',
    stage: 'runtime-contract',
  });
  expect(result.inactiveProperty).toEqual({
    ok: false,
    message: 'Amount is not used by the final shader result.',
    stage: 'runtime-contract',
  });
  expect(result.transparentResult).toEqual({
    ok: false,
    message: 'The shader result is fully transparent.',
    stage: 'render',
  });
  expect(result.flatResult).toEqual({
    ok: false,
    message: 'The shader result is visually flat. Preserve visible detail from the connected image.',
    stage: 'render',
  });
  expect(result.inertProperty).toEqual({
    ok: false,
    message: 'Amount does not visibly change the shader result.',
    stage: 'runtime-contract',
  });
  expect(result.gatedControls).toEqual({ ok: true, message: null, stage: null });
  expect(result.warpControl).toEqual({ ok: true, message: null, stage: null });
  expect(result.webGlContexts).toBe(10);
  expect(result.releasedContexts).toBe(10);
});

test('runs an AI shader as a backdrop-aware graph effect with preview and output parity', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { makeFillLayer, makeGraphShaderNode } = await import('/app/types/config.ts');
    const { EXPORT_NODE_ID } = await import('/app/utils/nodeGraph.ts');
    const { renderDocument, renderGraphTarget } = await import('/app/utils/renderer.ts');
    const base = makeFillLayer({ id: 'base-fill', color: '#24334f', opacity: 100, blendMode: 'normal' });
    const shader = makeGraphShaderNode({
      id: 'ai-effect',
      shaderKind: 'aiShader',
      role: 'effect',
      opacity: 100,
      blendMode: 'normal',
      shaderInstance: {
        definition: {
          version: 1,
          id: 'ai-effect-definition',
          label: 'AI Channel Shift',
          language: 'glsl-fragment',
          code: `vec4 mainImage(vec2 uv) {
            vec4 source = texture2D(u_backdrop, uv);
            return vec4(1.0 - source.r, source.g, source.b, source.a);
          }`,
          properties: [],
          provenance: { source: 'openai', prompt: 'Invert the red channel', model: 'browser-fixture' },
        },
        values: {},
      },
    });
    const graph = {
      edges: [
        { id: 'base-ai', fromId: base.id, fromPort: 'out', toId: shader.id, toPort: 'bg' },
        { id: 'ai-export', fromId: shader.id, fromPort: 'out', toId: EXPORT_NODE_ID, toPort: 'in' },
      ],
      positions: {},
      mergeNodes: [],
      colorNodes: [],
      shaderNodes: [shader],
    };
    const doc = {
      schemaVersion: 3,
      global: { bg: 'transparent', seed: 1171, aspect: '1:1' },
      layers: [base],
      graph,
      export: { format: 'png', scale: 1, target: 'cover' },
    };
    const output = await renderGraphTarget(doc, graph, EXPORT_NODE_ID, 32, 32, new Map(), { skipEffects: true });
    const preview = await renderDocument(doc, 32, 32, new Map(), { skipEffects: true, graphMode: 'graph' });
    const outputPixels = Array.from(output.getContext('2d')!.getImageData(0, 0, 32, 32).data);
    const previewPixels = Array.from(preview.getContext('2d')!.getImageData(0, 0, 32, 32).data);
    return {
      outputPixel: outputPixels.slice(0, 4),
      parity: outputPixels.every((value, index) => value === previewPixels[index]),
    };
  });

  expect(result.parity).toBe(true);
  expect(result.outputPixel[0]).toBeGreaterThan(210);
  expect(result.outputPixel.slice(1)).toEqual([51, 79, 255]);
});

test('migrates legacy AI operations into a compilable backdrop-aware shader', async ({ page }) => {
  await page.goto('/');

  const result = await page.evaluate(async () => {
    const { normalizeDocument } = await import('/app/utils/documentPersistence.ts');
    const { compileCustomCodeShaderForDiagnostics } = await import('/app/utils/render/customCodeShader.ts');
    const doc = normalizeDocument({
      schemaVersion: 2,
      layers: [],
      graph: {
        edges: [],
        positions: {},
        mergeNodes: [],
        colorNodes: [],
        shaderNodes: [
          {
            id: 'legacy-ai',
            shaderKind: 'customSpec',
            role: 'effect',
            customShaderSpec: {
              version: 2,
              base: 0.4,
              contrast: 1.3,
              palette: ['#101828', '#ff7043', '#ffe082'],
              operations: [
                { op: 'noise', scale: 3.2, amount: 0.2, octaves: 4 },
                { op: 'wave', frequency: 8, amplitude: 0.12, angle: 25 },
                { op: 'rings', frequency: 12, amount: 0.08 },
                { op: 'swirl', amount: 0.16, radius: 1.2 },
                { op: 'threshold', value: 0.5, softness: 0.1 },
                { op: 'posterize', steps: 5 },
                { op: 'invert', amount: 0.15 },
                { op: 'sourceLuma', amount: 0.4 },
                { op: 'edgeGlow', amount: 0.3, softness: 0.15 },
                { op: 'chromaticShift', amount: 0.2, angle: 12 },
                { op: 'gradientMap', amount: 0.65 },
              ],
            },
          },
        ],
      },
    });
    const definition = doc.graph?.shaderNodes?.[0]?.shaderInstance?.definition;
    if (!definition) return { ok: false, message: 'Migration did not create a shader definition.' };
    return compileCustomCodeShaderForDiagnostics(definition.code, definition.properties, { requireBackdrop: true });
  });

  expect(result).toEqual({ ok: true, message: null, stage: null });
});
