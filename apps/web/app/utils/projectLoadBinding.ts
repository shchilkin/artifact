import type { CanvasDocument } from '../types/config';
import type { ActiveProjectBinding } from './activeProjectBinding';
import { documentFingerprint } from './documentFingerprint';
import type { SavedProject } from './projectLibrary';

/** A project identity follows only the document actually accepted by core. */
export async function acceptProjectDocument(
  project: SavedProject,
  prepared: CanvasDocument,
  loadDocument: (doc: CanvasDocument) => Promise<CanvasDocument | null>,
  currentDocument: () => CanvasDocument,
  bind: (binding: ActiveProjectBinding | null) => void,
): Promise<boolean> {
  const accepted = await loadDocument(prepared);
  if (!accepted || currentDocument() !== accepted) return false;
  bind(
    project.id === 'pre-blank-draft'
      ? null
      : { projectId: project.id, savedFingerprint: documentFingerprint(prepared) },
  );
  return true;
}
