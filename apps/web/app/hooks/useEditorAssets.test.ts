import { describe, expect, it } from 'vitest';

import { unsupportedAssetDropMessage } from './useEditorAssets';

describe('useEditorAssets', () => {
  it('explains unsupported dropped files with the currently supported 3D formats', () => {
    expect(unsupportedAssetDropMessage({ name: 'skull.obj' })).toBe(
      'Unsupported file: skull.obj. Drop images, GLB models, EXR/HDR environments, or .artifact documents.',
    );
  });
});
