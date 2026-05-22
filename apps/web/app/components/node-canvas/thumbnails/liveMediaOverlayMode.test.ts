import { describe, expect, it } from 'vitest';
import { makeImageLayer, makeTextLayer } from '../../../types/config';
import { getLiveImageSource, shouldResolveLiveImageSource, shouldUseLiveMediaOverlay } from './liveMediaOverlayMode';

describe('shouldUseLiveMediaOverlay', () => {
  it('keeps selected idle media nodes on the canonical rendered thumbnail', () => {
    expect(
      shouldUseLiveMediaOverlay({
        layer: makeImageLayer('data:image/png;base64,AAAA'),
        selected: true,
        transformActive: false,
        liveImageSource: 'data:image/png;base64,AAAA',
      }),
    ).toBe(false);
  });

  it('uses the live overlay for active text transforms', () => {
    expect(
      shouldUseLiveMediaOverlay({
        layer: makeTextLayer({ content: 'Rental Visory' }),
        selected: true,
        transformActive: true,
      }),
    ).toBe(true);
  });

  it('waits for a renderable image source before switching to the live overlay', () => {
    const layer = makeImageLayer('artifact-asset://generated');

    expect(shouldUseLiveMediaOverlay({ layer, selected: true, transformActive: true, liveImageSource: null })).toBe(
      false,
    );
    expect(
      shouldUseLiveMediaOverlay({
        layer,
        selected: true,
        transformActive: true,
        liveImageSource: 'data:image/png;base64,AAAA',
      }),
    ).toBe(true);
  });
});

describe('getLiveImageSource', () => {
  it('uses plain image sources directly', () => {
    const layer = makeImageLayer('data:image/png;base64,AAAA');

    expect(getLiveImageSource(layer, new Map())).toBe('data:image/png;base64,AAAA');
  });

  it('does not expose unresolved local asset URIs to live image elements', () => {
    const layer = makeImageLayer('artifact-asset://generated');

    expect(getLiveImageSource(layer, new Map())).toBeNull();
  });

  it('uses a resolved cached source for local assets', () => {
    const layer = makeImageLayer('artifact-asset://generated');
    const image = { src: 'data:image/png;base64,AAAA', currentSrc: '' } as HTMLImageElement;

    expect(getLiveImageSource(layer, new Map([[layer.src, image]]))).toBe('data:image/png;base64,AAAA');
  });
});

describe('shouldResolveLiveImageSource', () => {
  it('resolves only unresolved local asset image sources', () => {
    expect(shouldResolveLiveImageSource(makeImageLayer('artifact-asset://generated'), null)).toBe(true);
    expect(
      shouldResolveLiveImageSource(makeImageLayer('artifact-asset://generated'), 'data:image/png;base64,AAAA'),
    ).toBe(false);
    expect(shouldResolveLiveImageSource(makeImageLayer('data:image/png;base64,AAAA'), null)).toBe(false);
    expect(shouldResolveLiveImageSource(makeTextLayer(), null)).toBe(false);
  });
});
