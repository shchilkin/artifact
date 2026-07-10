import { expect, test } from '@playwright/test';
import type { ShaderPropertyDefinition } from '../../apps/web/app/types/config';

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
      return { diagnostics, disabledPixel, pixel, releasedContexts, webGlContexts };
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(result.diagnostics).toEqual({ ok: true, message: null });
  expect(result.pixel[3]).toBe(255);
  expect(result.pixel[0]).toBeGreaterThan(110);
  expect(result.pixel[0]).toBeLessThan(150);
  expect(result.pixel[1]).toBeLessThan(8);
  expect(result.pixel[2]).toBeLessThan(8);
  expect(result.disabledPixel.slice(0, 3)).toEqual([0, 0, 0]);
  expect(result.webGlContexts).toBe(3);
  expect(result.releasedContexts).toBe(3);
});
