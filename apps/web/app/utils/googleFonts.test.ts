import { describe, expect, it } from 'vitest';
import {
  createGoogleFontAssetMetadata,
  createGoogleFontRequest,
  parseGoogleFontFaces,
  pickGoogleFontFace,
} from './googleFonts';

describe('googleFonts helpers', () => {
  it('builds a CSS2 request from a family name', () => {
    expect(createGoogleFontRequest('Space Grotesk')).toEqual({
      family: 'Space Grotesk',
      cssUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk&display=swap',
    });
  });

  it('accepts an existing Google Fonts CSS URL and normalizes display swap', () => {
    expect(createGoogleFontRequest('https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@700')).toEqual({
      family: 'Roboto Mono',
      cssUrl: 'https://fonts.googleapis.com/css2?family=Roboto+Mono%3Awght%40700&display=swap',
    });
  });

  it('parses and prefers a Latin woff2 face from CSS', () => {
    const css = `
      @font-face {
        font-family: 'Poster Test';
        src: url(https://fonts.gstatic.com/s/postertest/cyrillic.woff2) format('woff2');
        unicode-range: U+0400-04FF;
      }
      @font-face {
        font-family: 'Poster Test';
        src: url(https://fonts.gstatic.com/s/postertest/latin.woff2) format('woff2');
        unicode-range: U+0000-00FF;
      }
    `;

    const face = pickGoogleFontFace(parseGoogleFontFaces(css));

    expect(face).toMatchObject({
      family: 'Poster Test',
      fontUrl: 'https://fonts.gstatic.com/s/postertest/latin.woff2',
      format: 'woff2',
    });
  });

  it('marks generated Google font assets as open-license embeddable', () => {
    const request = createGoogleFontRequest('Space Grotesk');
    const asset = createGoogleFontAssetMetadata({
      id: 'google-space-grotesk-1',
      family: 'Space Grotesk',
      request: request!,
      face: {
        family: 'Space Grotesk',
        fontUrl: 'https://fonts.gstatic.com/s/spacegrotesk/latin.woff2',
        format: 'woff2',
      },
      dataUrl: 'data:font/woff2;base64,AAAA',
      bytes: 4,
      createdAt: '2026-05-26T00:00:00.000Z',
    });

    expect(asset).toMatchObject({
      label: 'Space Grotesk',
      source: 'google-fonts',
      sourceName: 'Space Grotesk (Google Fonts)',
      embeddingPolicy: 'open-license-embeddable',
      license: { name: 'SIL Open Font License 1.1', allowsEmbedding: true },
    });
  });
});
