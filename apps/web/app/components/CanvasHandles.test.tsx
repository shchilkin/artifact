import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { TextLayer } from '../types/config';
import { CanvasHandles } from './CanvasHandles';

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
    expect(html).not.toContain('stroke="#333"');
    expect(html).not.toContain('fill="#fff"');
  });
});
