import type { ArtifactEffectLayer, ArtifactRuntimeProject } from './types.js';

const SUPPORTED_DOCUMENT_SCHEMA = 3;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseArtifactRuntimeProject(value: unknown): ArtifactRuntimeProject {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isRecord(parsed) || parsed.artifactPackage !== 'project') {
    throw new Error('Artifact Runtime expected a portable project package.');
  }

  const manifest = parsed.manifest;
  const document = parsed.document;
  if (!isRecord(manifest) || manifest.kind !== 'artifact-project-package' || !isRecord(document)) {
    throw new Error('Artifact Runtime received an invalid project package.');
  }
  if (manifest.documentSchemaVersion !== SUPPORTED_DOCUMENT_SCHEMA) {
    throw new Error(`Artifact Runtime supports document schema ${SUPPORTED_DOCUMENT_SCHEMA}.`);
  }
  if (!isRecord(document.global) || typeof document.global.seed !== 'number' || !Array.isArray(document.layers)) {
    throw new Error('Artifact Runtime received an invalid document payload.');
  }

  return parsed as unknown as ArtifactRuntimeProject;
}

export function getEffectLayers(project: ArtifactRuntimeProject): ArtifactEffectLayer[] {
  return project.document.layers.filter((layer): layer is ArtifactEffectLayer => {
    return layer.kind === 'effect' && typeof layer.id === 'string';
  });
}
