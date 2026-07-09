import { describe, expect, it } from 'vitest';
import { defaultShaderPalette, normalizeShaderPalette, shaderPaletteConfig } from './shaderPalette';

describe('shaderPalette', () => {
  it('uses preset-specific default palette counts', () => {
    expect(defaultShaderPalette('meshGradient')).toHaveLength(4);
    expect(defaultShaderPalette('waves')).toHaveLength(3);
    expect(defaultShaderPalette('moire')).toHaveLength(2);
  });

  it('normalizes imported values and clamps them to preset limits', () => {
    expect(normalizeShaderPalette('moire', ['#123', 'not-a-color', 42])).toEqual(['#112233', '#f7e6ff']);
    expect(normalizeShaderPalette('moire', ['#111111', '#222222', '#333333', '#444444', '#555555'])).toEqual([
      '#111111',
      '#222222',
      '#333333',
      '#444444',
    ]);
  });

  it('uses defaults for malformed non-array palettes', () => {
    expect(normalizeShaderPalette('waves', { length: 2 })).toEqual(defaultShaderPalette('waves'));
  });

  it('does not expose palette additions for AI and Code Shader modes', () => {
    expect(shaderPaletteConfig('meshGradient')).toMatchObject({ min: 2, max: 8, addable: true });
    expect(shaderPaletteConfig('customSpec')).toMatchObject({ addable: false });
    expect(shaderPaletteConfig('customCode')).toMatchObject({ addable: false });
  });
});
