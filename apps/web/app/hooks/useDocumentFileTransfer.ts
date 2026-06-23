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

export interface PendingDocumentImport {
  id: string;
  fileName: string;
  fileSize: number;
  fileKind: 'document' | 'project-package';
  doc: CanvasDocument;
  layerCount: number;
  aspect: string;
  hasGraph: boolean;
}

export function isArtifactDocumentFile(file: File) {
  return (
    file.name.endsWith(ARTIFACT_FILE_EXTENSION) ||
    file.type === ARTIFACT_FILE_MIME ||
    isArtifactProjectPackageFile(file)
  );
}

function isProjectPackageDocumentFile(file: File) {
  return file.name.endsWith(ARTIFACT_PROJECT_PACKAGE_EXTENSION) || file.type === ARTIFACT_PROJECT_PACKAGE_MIME;
}

function documentFileSizeLimit(file: File) {
  return isProjectPackageDocumentFile(file) ? MAX_PROJECT_PACKAGE_BYTES : MAX_DOCUMENT_BYTES;
}

async function loadProjectPackageDocument(fileText: string): Promise<CanvasDocument | null> {
  const projectPackage = parseArtifactProjectPackage(fileText);
  return projectPackage ? importArtifactProjectPackage(projectPackage) : null;
}

async function loadArtifactJsonDocument(fileText: string): Promise<CanvasDocument | null> {
  const importedDoc = parseArtifactDocument(fileText);
  return importedDoc ? storePortableDocumentAssets(importedDoc) : null;
}

function validateDocumentFile(file: File): string | null {
  if (!isArtifactDocumentFile(file)) {
    return `Choose an ${ARTIFACT_FILE_EXTENSION} or ${ARTIFACT_PROJECT_PACKAGE_EXTENSION} file.`;
  }
  const maxBytes = documentFileSizeLimit(file);
  return file.size > maxBytes ? `Document too large - max ${maxBytes / 1024 / 1024}MB` : null;
}

async function loadDocumentFromFile(file: File): Promise<{ doc: CanvasDocument | null; error: string | null }> {
  const isProjectPackage = isProjectPackageDocumentFile(file);
  const fileText = await file.text();
  const doc = isProjectPackage ? await loadProjectPackageDocument(fileText) : await loadArtifactJsonDocument(fileText);
  if (doc) return { doc, error: null };
  return {
    doc: null,
    error: isProjectPackage ? 'Could not read project package.' : 'Could not read document JSON.',
  };
}

async function readDocumentFileResult(file: File): Promise<{ doc: CanvasDocument | null; error: string | null }> {
  const validationError = validateDocumentFile(file);
  if (validationError) return { doc: null, error: validationError };
  try {
    return await loadDocumentFromFile(file);
  } catch {
    return { doc: null, error: 'Could not read document file.' };
  }
}

function createPendingDocumentImport(file: File, doc: CanvasDocument): PendingDocumentImport {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    fileName: file.name || 'Untitled artifact',
    fileSize: file.size,
    fileKind: isProjectPackageDocumentFile(file) ? 'project-package' : 'document',
    doc,
    layerCount: doc.layers.length,
    aspect: doc.global.aspect ?? '1:1',
    hasGraph: Boolean(doc.graph),
  };
}

async function readPendingDocumentImport(
  file: File,
): Promise<{ pendingImport: PendingDocumentImport | null; error: string | null }> {
  const result = await readDocumentFileResult(file);
  if (!result.doc) return { pendingImport: null, error: result.error ?? 'Could not read document file.' };
  return { pendingImport: createPendingDocumentImport(file, result.doc), error: null };
}

export function useDocumentFileTransfer(
  docRef: MutableRefObject<CanvasDocument>,
  onLoadDocument: (doc: CanvasDocument) => void,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [documentFileError, setDocumentFileError] = useState<string | null>(null);
  const [pendingDocumentImport, setPendingDocumentImport] = useState<PendingDocumentImport | null>(null);

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
      const result = await readDocumentFileResult(file);
      if (!result.doc) {
        showDocumentFileError(result.error ?? 'Could not read document file.');
        return;
      }
      onLoadDocument(result.doc);
      setDocumentFileError(null);
    },
    [onLoadDocument, showDocumentFileError],
  );

  const handleStageDocumentImport = useCallback(
    async (file: File | null | undefined) => {
      if (!file) return;
      const result = await readPendingDocumentImport(file);
      if (!result.pendingImport) {
        showDocumentFileError(result.error ?? 'Could not read document file.');
        return;
      }
      setPendingDocumentImport(result.pendingImport);
      setDocumentFileError(null);
    },
    [showDocumentFileError],
  );

  const handleCancelDocumentImport = useCallback(() => {
    setPendingDocumentImport(null);
  }, []);

  const handleConfirmDocumentImport = useCallback(() => {
    if (!pendingDocumentImport) return;
    onLoadDocument(pendingDocumentImport.doc);
    setPendingDocumentImport(null);
    setDocumentFileError(null);
  }, [onLoadDocument, pendingDocumentImport]);

  return {
    fileInputRef,
    documentFileError,
    pendingDocumentImport,
    handleCancelDocumentImport,
    handleConfirmDocumentImport,
    handleOpenDocument,
    handleOpenDocumentPicker,
    handleSaveDocument,
    handleSaveProjectPackage,
    handleStageDocumentImport,
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
