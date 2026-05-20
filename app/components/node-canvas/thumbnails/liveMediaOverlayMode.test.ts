import { describe, expect, it } from 'vitest';
import { makeImageLayer, makeTextLayer } from '../../../types/config';
import { shouldUseLiveMediaOverlay } from './liveMediaOverlayMode';

describe('shouldUseLiveMediaOverlay', () => {
  it('keeps selected idle media nodes on the canonical rendered thumbnail', () => {
    expect(
      shouldUseLiveMediaOverlay({
        layer: makeImageLayer('data:image/png;base64,AAAA'),
        selected: true,
        transformActive: false,
        imageReady: true,
      }),
    ).toBe(false);
  });

  it('uses the live overlay for active text transforms', () => {
    expect(
      shouldUseLiveMediaOverlay({
        layer: makeTextLayer({ content: 'Rental Visory' }),
        selected: true,
        transformActive: true,
        imageReady: false,
      }),
    ).toBe(true);
  });

  it('waits for local asset images before switching to the live overlay', () => {
    const layer = makeImageLayer('artifact-asset://generated');

    expect(shouldUseLiveMediaOverlay({ layer, selected: true, transformActive: true, imageReady: false })).toBe(false);
    expect(shouldUseLiveMediaOverlay({ layer, selected: true, transformActive: true, imageReady: true })).toBe(true);
  });
});
