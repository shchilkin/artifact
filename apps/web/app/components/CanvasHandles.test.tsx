import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TextLayer } from '../types/config';
import { CanvasHandles } from './CanvasHandles';
import { nextKeyboardLayer } from './canvasHandleTransforms';

const textLayer: TextLayer = {
  id: 'canvas-handles-text',
  name: 'Canvas title',
  visible: false,
  locked: true,
  kind: 'text',
  content: 'Artifact',
  font: 'DISPLAY',
  size: 72,
  color: '#f4eee4',
  opacity: 100,
  blendMode: 'normal',
  x: 0.5,
  y: 0.5,
  rotation: 0,
  align: 'center',
  scaleX: 1,
  scaleY: 1,
};

describe('CanvasHandles chrome', () => {
  it('exposes semantic selected, locked, and hidden anatomy without hardcoded chrome colors', () => {
    const html = renderToStaticMarkup(
      <CanvasHandles layer={textLayer} canvasW={540} canvasH={540} imageCache={new Map()} onChange={vi.fn()} />,
    );

    expect(html).toContain('class="canvas-selection-chrome"');
    expect(html).toContain('data-layer-lock="locked"');
    expect(html).toContain('data-layer-visibility="hidden"');
    expect(html).toContain('class="canvas-selection-chrome__outline"');
    expect(html).toContain('data-canvas-handle="rotation"');
    expect(html).toContain('aria-label="Move Canvas title.');
    expect(html).toContain('aria-label="Rotate Canvas title.');
    expect(html).toContain('tabindex="0"');
    expect(html).not.toContain('aria-hidden="true" class="canvas-selection-chrome"');
    expect(html).not.toContain('stroke="#333"');
    expect(html).not.toContain('fill="#fff"');
  });

  it('maps keyboard movement to canvas pixels and supports accelerated steps', () => {
    const moved = nextKeyboardLayer({
      layer: textLayer,
      mode: 'move',
      key: 'ArrowRight',
      canvasW: 500,
      canvasH: 250,
      accelerated: false,
      independent: false,
    });
    const accelerated = nextKeyboardLayer({
      layer: textLayer,
      mode: 'move',
      key: 'ArrowUp',
      canvasW: 500,
      canvasH: 250,
      accelerated: true,
      independent: false,
    });

    expect(moved?.x).toBeCloseTo(0.502);
    expect(moved?.y).toBe(0.5);
    expect(accelerated?.x).toBe(0.5);
    expect(accelerated?.y).toBeCloseTo(0.46);
  });

  it('reuses proportional scale math while exposing independent keyboard scaling', () => {
    const proportional = nextKeyboardLayer({
      layer: textLayer,
      mode: 'scale-se',
      key: 'ArrowRight',
      canvasW: 500,
      canvasH: 250,
      accelerated: false,
      independent: false,
    });
    const independent = nextKeyboardLayer({
      layer: textLayer,
      mode: 'scale-se',
      key: 'ArrowDown',
      canvasW: 500,
      canvasH: 250,
      accelerated: false,
      independent: true,
    });

    expect(proportional?.scaleX).toBeGreaterThan(1);
    expect(proportional?.scaleY).toBe(proportional?.scaleX);
    expect(independent?.scaleX).toBe(1);
    expect(independent?.scaleY).toBeGreaterThan(1);
  });

  it('rotates by one degree or ten degrees and ignores unrelated keys', () => {
    const rotated = nextKeyboardLayer({
      layer: textLayer,
      mode: 'rotate',
      key: 'ArrowLeft',
      canvasW: 540,
      canvasH: 540,
      accelerated: true,
      independent: false,
    });
    const ignored = nextKeyboardLayer({
      layer: textLayer,
      mode: 'rotate',
      key: 'Enter',
      canvasW: 540,
      canvasH: 540,
      accelerated: false,
      independent: false,
    });

    expect(rotated?.rotation).toBe(-10);
    expect(ignored).toBeNull();
  });
});
