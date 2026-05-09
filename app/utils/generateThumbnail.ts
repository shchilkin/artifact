import { ASPECT_SIZES, type CanvasDocument } from '../types/config';
import { renderDocument } from './renderer';

const THUMB_LONG_EDGE = 280;

export async function generateThumbnail(
  doc: CanvasDocument,
  imageCache: Map<string, HTMLImageElement>,
): Promise<string> {
  const aspect = doc.global?.aspect ?? '1:1';
  const [aw, ah] = ASPECT_SIZES[aspect] ?? ASPECT_SIZES['1:1'];
  const longest = Math.max(aw, ah);
  const scale = THUMB_LONG_EDGE / longest;
  const W = Math.max(1, Math.round(aw * scale));
  const H = Math.max(1, Math.round(ah * scale));
  const out = await renderDocument(doc, W, H, imageCache);
  return out.toDataURL('image/jpeg', 0.8);
}
