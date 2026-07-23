import type { AddLibraryItem } from './addLibraryModel';

export type AddLibraryPreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'fallback'; url: string }
  | { status: 'failed' };

interface AddLibraryPreviewRenderers {
  renderCanonical: (item: AddLibraryItem) => Promise<string>;
  renderFallback: (item: AddLibraryItem) => string;
}

export async function resolveAddLibraryPreviewState(
  item: AddLibraryItem,
  { renderCanonical, renderFallback }: AddLibraryPreviewRenderers,
): Promise<Exclude<AddLibraryPreviewState, { status: 'loading' }>> {
  try {
    const url = await renderCanonical(item);
    if (url) return { status: 'ready', url };
  } catch {
    // The explicit fallback state below distinguishes renderer failure from a canonical preview.
  }

  try {
    const url = renderFallback(item);
    return url ? { status: 'fallback', url } : { status: 'failed' };
  } catch {
    return { status: 'failed' };
  }
}
