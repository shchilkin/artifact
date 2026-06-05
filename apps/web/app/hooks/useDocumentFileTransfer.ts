import { type MutableRefObject, useCallback, useRef, useState } from 'react';
import type { CanvasDocument } from '../types/config';
import { preparePortableDocument, storePortableDocumentAssets } from '../utils/documentAssets';
import {
  ARTIFACT_PROJECT_PACKAGE_EXTENSION,
  ARTIFACT_PROJECT_PACKAGE_MIME,
  createArtifactProjectPackageFileName,
  importArtifactProjectPackage,
  isArtifactProjectPackageFile,
  type ProjectPackageFontEmbeddingMode,
  parseArtifactProjectPackage,
  prepareArtifactProjectPackage,
  serializeArtifactProjectPackage,
} from '../utils/documentPackage';
import {
  ARTIFACT_FILE_EXTENSION,
  ARTIFACT_FILE_MIME,
  createArtifactFileName,
  parseArtifactDocument,
  serializeArtifactDocument,
} from '../utils/documentPersistence';

const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const MAX_PROJECT_PACKAGE_BYTES = 75 * 1024 * 1024;

export function isArtifactDocumentFile(file: File) {
  return (
    file.name.endsWith(ARTIFACT_FILE_EXTENSION) ||
    file.type === ARTIFACT_FILE_MIME ||
    isArtifactProjectPackageFile(file)
  );
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
        downloadBlob(blob, createArtifactFileName(docRef.current));
        setDocumentFileError(null);
      })
      .catch(() => {
        showDocumentFileError('Could not prepare document assets.');
      });
  }, [docRef, showDocumentFileError]);

  const handleSaveProjectPackage = useCallback(
    (fontEmbeddingMode: ProjectPackageFontEmbeddingMode = 'license-aware') => {
      if (
        fontEmbeddingMode === 'explicit-font-files' &&
        !window.confirm(
          'PKG+FONTS embeds imported local font files in the project package. Continue only if you have the right to distribute those font files.',
        )
      ) {
        return;
      }

      prepareArtifactProjectPackage(docRef.current, { fontEmbeddingMode })
        .then((projectPackage) => {
          const blob = new Blob([serializeArtifactProjectPackage(projectPackage)], {
            type: ARTIFACT_PROJECT_PACKAGE_MIME,
          });
          downloadBlob(blob, createArtifactProjectPackageFileName(docRef.current));
          setDocumentFileError(null);
        })
        .catch(() => {
          showDocumentFileError('Could not prepare project package.');
        });
    },
    [docRef, showDocumentFileError],
  );

  const handleOpenDocumentPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenDocument = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      if (!isArtifactDocumentFile(file)) {
        showDocumentFileError(`Choose an ${ARTIFACT_FILE_EXTENSION} or ${ARTIFACT_PROJECT_PACKAGE_EXTENSION} file.`);
        return;
      }
      const isProjectPackage =
        file.name.endsWith(ARTIFACT_PROJECT_PACKAGE_EXTENSION) || file.type === ARTIFACT_PROJECT_PACKAGE_MIME;
      const maxBytes = isProjectPackage ? MAX_PROJECT_PACKAGE_BYTES : MAX_DOCUMENT_BYTES;
      if (file.size > maxBytes) {
        showDocumentFileError(`Document too large - max ${maxBytes / 1024 / 1024}MB`);
        return;
      }

      try {
        const fileText = await file.text();
        if (isProjectPackage) {
          const projectPackage = parseArtifactProjectPackage(fileText);
          if (!projectPackage) {
            showDocumentFileError('Could not read project package.');
            return;
          }
          onLoadDocument(await importArtifactProjectPackage(projectPackage));
          setDocumentFileError(null);
          return;
        }

        const importedDoc = parseArtifactDocument(fileText);
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
    handleSaveProjectPackage,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
