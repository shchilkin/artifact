import type { ArtifactEffectLayer, ArtifactRuntimeProject } from './types.js';

const SUPPORTED_DOCUMENT_SCHEMA = 3;
const SUPPORTED_PACKAGE_VERSION = 1;
const GRAPH_NODE_COLLECTIONS = [
  'mergeNodes',
  'colorNodes',
  'repeatNodes',
  'materialNodes',
  'maskNodes',
  'transformNodes',
  'grimeShadowNodes',
  'scene3dNodes',
  'environmentNodes',
  'shaderNodes',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateManifest(value: unknown) {
  if (!isRecord(value) || value.kind !== 'artifact-project-package') {
    throw new Error('Artifact Runtime received an invalid project package.');
  }
  if (value.version !== SUPPORTED_PACKAGE_VERSION) {
    throw new Error(`Artifact Runtime supports project package version ${SUPPORTED_PACKAGE_VERSION}.`);
  }
  if (value.documentSchemaVersion !== SUPPORTED_DOCUMENT_SCHEMA) {
    throw new Error(`Artifact Runtime supports document schema ${SUPPORTED_DOCUMENT_SCHEMA}.`);
  }
}

function validateGraph(value: unknown) {
  if (!isRecord(value)) throw new Error('Artifact Runtime received an invalid graph payload.');
  const edges = value.edges;
  if (!Array.isArray(edges)) throw new Error('Artifact Runtime received an invalid graph payload.');
  const hasValidEdges = edges.every(
    (edge) => isRecord(edge) && typeof edge.fromId === 'string' && typeof edge.toId === 'string',
  );
  if (!hasValidEdges) throw new Error('Artifact Runtime received an invalid graph edge.');
  const hasValidNodeCollections = GRAPH_NODE_COLLECTIONS.every(
    (collection) => value[collection] === undefined || Array.isArray(value[collection]),
  );
  if (!hasValidNodeCollections) throw new Error('Artifact Runtime received an invalid graph node collection.');
}

function validateDocument(value: unknown) {
  if (!isRecord(value)) throw new Error('Artifact Runtime received an invalid project package.');
  if (value.schemaVersion !== SUPPORTED_DOCUMENT_SCHEMA) {
    throw new Error(`Artifact Runtime received document schema ${String(value.schemaVersion)} in the package payload.`);
  }
  if (!isRecord(value.global) || typeof value.global.seed !== 'number' || !Array.isArray(value.layers)) {
    throw new Error('Artifact Runtime received an invalid document payload.');
  }
  const hasValidLayers = value.layers.every(
    (layer) => isRecord(layer) && typeof layer.id === 'string' && typeof layer.kind === 'string',
  );
  if (!hasValidLayers) throw new Error('Artifact Runtime received an invalid layer payload.');
  if (value.graph !== undefined) validateGraph(value.graph);
}

export function parseArtifactRuntimeProject(value: unknown): ArtifactRuntimeProject {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value;
  if (!isRecord(parsed) || parsed.artifactPackage !== 'project') {
    throw new Error('Artifact Runtime expected a portable project package.');
  }
  validateManifest(parsed.manifest);
  validateDocument(parsed.document);

  return parsed as unknown as ArtifactRuntimeProject;
}

export function getEffectLayers(project: ArtifactRuntimeProject): ArtifactEffectLayer[] {
  return project.document.layers.filter((layer): layer is ArtifactEffectLayer => {
    return layer.kind === 'effect' && typeof layer.id === 'string';
  });
}
