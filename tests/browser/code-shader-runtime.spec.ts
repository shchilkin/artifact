import { expect, test } from '@playwright/test';

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

    const code = 'vec4 mainImage(vec2 uv) { return vec4(uv.x, uv.y, 1.0 - uv.x, 1.0); }';
    try {
      const canvas = shaderRuntime.renderCustomCodeShaderNodeToCanvas(
        {
          shaderKind: 'customCode',
          customShaderCode: { version: 1, language: 'glsl-fragment', code },
          colorC: '#79e3c5',
          distortion: 56,
          scale: 100,
          seedOffset: 0,
        } as never,
        1171,
        64,
        64,
      );
      const pixel = Array.from(canvas.getContext('2d')!.getImageData(32, 32, 1, 1).data);
      const diagnostics = shaderRuntime.compileCustomCodeShaderForDiagnostics(code);
      return { diagnostics, pixel, releasedContexts, webGlContexts };
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }
  });

  expect(result.diagnostics).toEqual({ ok: true, message: null });
  expect(result.pixel[3]).toBe(255);
  expect(result.pixel[0]).toBeGreaterThan(80);
  expect(result.webGlContexts).toBe(2);
  expect(result.releasedContexts).toBe(2);
});
