/**
 * Dev-only logging utilities.
 *
 * All functions are no-ops in production builds (import.meta.env.DEV is
 * statically false at build time, so tree-shaking removes the bodies).
 */

export type ThumbnailInvalidationCause = 'layer' | 'graph' | 'camera' | 'image';

export interface ThumbnailInvalidationEvent {
  cause: ThumbnailInvalidationCause;
  targetId: string;
  itemId?: string;
  itemKind?: string;
  oldSig?: string;
  newSig?: string;
}

export function logThumbnailInvalidation(event: ThumbnailInvalidationEvent): void {
  if (import.meta.env.DEV) {
    const { cause, targetId, itemId, itemKind } = event;
    const tag = itemKind ? `${itemKind}/${itemId}` : itemId;
    console.debug(`[thumbnail:${cause}] target=${targetId}${tag ? ` item=${tag}` : ''}`);
  }
}
