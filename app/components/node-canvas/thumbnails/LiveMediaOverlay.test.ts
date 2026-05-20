import { describe, expect, it } from 'vitest';
import { getLiveMediaReferenceScale } from './liveMediaSizing';
import { getNodePreviewSize } from './previewSizing';

describe('getLiveMediaReferenceScale', () => {
  it('uses the display width baseline that free-fit image rendering uses', () => {
    const portrait = getNodePreviewSize('4:5');

    expect(getLiveMediaReferenceScale(portrait.display.width)).toBe(portrait.display.width / 540);
    expect(getLiveMediaReferenceScale(portrait.display.width)).not.toBe(
      Math.max(portrait.display.width, portrait.display.height) / 540,
    );
  });
});
