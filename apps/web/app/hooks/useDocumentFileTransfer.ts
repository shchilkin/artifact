import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { preparePortableDocument, storePortableDocumentAssets } from '../utils/documentAssets';
import {
  ARTIFACT_FILE_EXTENSION,
  ARTIFACT_FILE_MIME,
  createArtifactFileName,
  parseArtifactDocument,
  serializeArtifactDocument,
} from '../utils/documentPersistence';

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;

export function isArtifactDocumentFile(file: File) {
  return file.name.endsWith(ARTIFACT_FILE_EXTENSION) || file.type === ARTIFACT_FILE_MIME;
}

export function useDocumentFileTransfer(
  docRef: MutableRefObject<CanvasDocument>,
  onLoadDocument: (doc: CanvasDocument) => void,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentFileError, setDocumentFileError] = useState<string | null>(null);

  const showDocumentFileError = useCallback((message: string) => {
    setDocumentFileError(message);
  }, []);

  const handleSaveDocument = useCallback(() => {
    preparePortableDocument(docRef.current)
      .then((portableDoc) => {
        const blob = new Blob([serializeArtifactDocument(portableDoc)], { type: ARTIFACT_FILE_MIME });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = createArtifactFileName(docRef.current);
        anchor.rel = 'noopener';
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
        setDocumentFileError(null);
      })
      .catch(() => {
        showDocumentFileError('Could not prepare document assets.');
      });
  }, [docRef, showDocumentFileError]);

  const handleOpenDocumentPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenDocument = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!isArtifactDocumentFile(file)) {
        showDocumentFileError(`Choose an ${ARTIFACT_FILE_EXTENSION} file.`);
        return;
      }
      if (file.size > MAX_DOCUMENT_BYTES) {
        showDocumentFileError(`Document too large - max ${MAX_DOCUMENT_BYTES / 1024 / 1024}MB`);
        return;
      }

      try {
        const importedDoc = parseArtifactDocument(await file.text());
        if (!importedDoc) {
          showDocumentFileError('Could not read document JSON.');
          return;
        }
        onLoadDocument(await storePortableDocumentAssets(importedDoc));
        setDocumentFileError(null);
      } catch {
        showDocumentFileError('Could not read document file.');
      }
    },
    [onLoadDocument, showDocumentFileError],
  );

  return {
    fileInputRef,
    documentFileError,
    handleOpenDocument,
    handleOpenDocumentPicker,
    handleSaveDocument,
  };
}
