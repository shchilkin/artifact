import type { CanvasDocument } from '../types/config';
import { renderDocument } from './renderer';

const THUMB_SIZE = 200;

export async function generateThumbnail(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
): Promise<string> {
  const out = await renderDocument(doc, THUMB_SIZE, THUMB_SIZE, imageCache);
  return out.toDataURL('image/jpeg', 0.8);
}
