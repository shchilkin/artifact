import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { CanvasPreviewRenderStatus } from './CanvasPreview';
import { resolveCanvasPreviewState } from './canvasPreviewState';

describe('CanvasPreview chrome states', () => {
  it('prioritizes error and loading without hiding stable ready states', () => {
    expect(
      resolveCanvasPreviewState({ isRendering: false, hasFrame: true, error: new Error('failed') }, true, true),
    ).toBe('error');
    expect(resolveCanvasPreviewState({ isRendering: true, hasFrame: false, error: null }, true, false)).toBe('loading');
    expect(resolveCanvasPreviewState({ isRendering: false, hasFrame: true, error: null }, false, false)).toBe('empty');
    expect(resolveCanvasPreviewState({ isRendering: false, hasFrame: true, error: null }, true, true)).toBe('selected');
  });

  it('uses Foundation feedback and recovery commands for render failures', () => {
    const html = renderToStaticMarkup(
      <CanvasPreviewRenderStatus
        renderState={{
          isRendering: false,
          hasFrame: true,
          error: new Error('failed'),
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('ui-inline-notice--danger');
    expect(html).toContain('data-canvas-preview-status="error"');
    expect(html).toContain('data-canvas-preview-recovery="true"');
    expect(html).toContain('Retry preview');
    expect(html).toContain('last good frame remains visible');
  });

  it('announces initial rendering with the Foundation progress contract', () => {
    const html = renderToStaticMarkup(
      <CanvasPreviewRenderStatus
        renderState={{
          isRendering: true,
          hasFrame: false,
          error: null,
        }}
        onRetry={vi.fn()}
      />,
    );

    expect(html).toContain('data-canvas-preview-status="loading"');
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-label="Preparing canvas preview"');
  });
});
