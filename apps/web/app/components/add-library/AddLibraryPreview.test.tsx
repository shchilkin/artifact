import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { AddLibraryPreview } from './AddLibraryPreview';
import { ADD_LIBRARY_ITEMS } from './addLibraryModel';
import { resolveAddLibraryPreviewState } from './addLibraryPreviewState';

const fillItem = ADD_LIBRARY_ITEMS.find((item) => item.id === 'layer:fill')!;

describe('AddLibraryPreview', () => {
  it('exposes its deterministic loading state before preview work completes', () => {
    const html = renderToStaticMarkup(<AddLibraryPreview item={fillItem} />);

    expect(html).toContain('data-preview-state="loading"');
    expect(html).toContain('Loading Fill preview');
  });

  it('reports canonical previews as ready', async () => {
    const state = await resolveAddLibraryPreviewState(fillItem, {
      renderCanonical: vi.fn().mockResolvedValue('data:image/png;base64,ready'),
      renderFallback: vi.fn(),
    });

    expect(state).toEqual({ status: 'ready', url: 'data:image/png;base64,ready' });
  });

  it('reports fallback previews separately when canonical rendering fails', async () => {
    const state = await resolveAddLibraryPreviewState(fillItem, {
      renderCanonical: vi.fn().mockRejectedValue(new Error('renderer unavailable')),
      renderFallback: vi.fn().mockReturnValue('data:image/png;base64,fallback'),
    });

    expect(state).toEqual({ status: 'fallback', url: 'data:image/png;base64,fallback' });
  });

  it('reports a failed state when neither renderer can produce a preview', async () => {
    const state = await resolveAddLibraryPreviewState(fillItem, {
      renderCanonical: vi.fn().mockResolvedValue(''),
      renderFallback: vi.fn().mockReturnValue(''),
    });

    expect(state).toEqual({ status: 'failed' });
  });
});
