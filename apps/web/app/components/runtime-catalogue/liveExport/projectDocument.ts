import type { CanvasDocument } from '../../../types/config';
import { collectDocumentImageSources, storePortableDocumentAssets } from '../../../utils/documentAssets';
import { importArtifactProjectPackage, parseArtifactProjectPackage } from '../../../utils/documentPackage';
import { parseArtifactDocument } from '../../../utils/documentPersistence';
import { preloadImageSources } from '../../../utils/preloadImageSources';

export interface LoadedProject {
  readonly doc: CanvasDocument;
  readonly imageCache: Map<string, HTMLImageElement>;
}

/**
 * Opens an `.artifact` project package (or a plain document) as the editor does: embedded images and fonts go to the
 * local asset stores, and the document's images are decoded for rendering.
 */
export async function loadProjectDocument(text: string): Promise<LoadedProject> {
  const projectPackage = parseArtifactProjectPackage(text);
  const portable = projectPackage ? null : parseArtifactDocument(text);
  const doc = projectPackage
    ? await importArtifactProjectPackage(projectPackage)
    : portable
      ? await storePortableDocumentAssets(portable)
      : null;
  if (!doc) throw new Error('Could not read the project: choose an .artifact file.');
  const imageCache = new Map<string, HTMLImageElement>();
  await preloadImageSources(collectDocumentImageSources(doc), imageCache);
  return { doc, imageCache };
}
