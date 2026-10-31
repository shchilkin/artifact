import { describe, expect, it } from 'vitest';

import { prunePrimitiveViewStates } from './useEditorPrimitiveExportState';

const viewState = {
  rotationX: 12,
  rotationY: 34,
  zoom: 1.25,
  panX: 0.1,
  panY: -0.2,
};

describe('useEditorPrimitiveExportState', () => {
  it('persists camera state for 3D Object viewport ids only', () => {
    expect(
      prunePrimitiveViewStates(
        {
          'primitive-a': { ...viewState, rotationX: 10 },
          'model-a': { ...viewState, rotationX: 20 },
          'scene-a': { ...viewState, rotationX: 30 },
          stale: { ...viewState, rotationX: 40 },
        },
        [
          { id: 'primitive-a', kind: 'primitive' },
          { id: 'model-a', kind: 'model' },
          { id: 'fill-a', kind: 'fill' },
        ],
      ),
    ).toEqual({
      'primitive-a': { ...viewState, rotationX: 10 },
      'model-a': { ...viewState, rotationX: 20 },
    });
  });
});
