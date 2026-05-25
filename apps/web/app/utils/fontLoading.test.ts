import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_EXPORT, type FontName, makeTextLayer } from '../types/config';
import { collectDocumentFontNames, ensureCanvasFontLoaded } from './fontLoading';

describe('fontLoading', () => {
  it('collects unique document text fonts', () => {
    const doc = {
      global: { bg: '#000000', seed: 1, aspect: '1:1' as const },
      layers: [
        makeTextLayer({ font: 'ANTON' }),
        makeTextLayer({ font: 'ANTON' }),
        makeTextLayer({ font: 'PRESS_START' }),
      ],
      export: { ...DEFAULT_EXPORT },
    };

    expect(collectDocumentFontNames(doc)).toEqual(['ANTON', 'PRESS_START']);
  });

  it('loads canvas fonts through document.fonts when available', async () => {
    const originalDocument = globalThis.document;
    const load = vi.fn().mockResolvedValue([]);
    vi.stubGlobal('document', { fonts: { load } });

    await ensureCanvasFontLoaded('BUNGEE' as FontName, 72);

    expect(load).toHaveBeenCalledWith('72px "Bungee"');
    vi.stubGlobal('document', originalDocument);
  });
});
