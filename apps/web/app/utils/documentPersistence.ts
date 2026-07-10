import { AI_SHADER_PROMPT_MAX_LENGTH, normalizeShaderInstance } from '@artifact/shared';
import {
  ASPECT_SIZES,
  type AspectRatio,
  type CanvasDocument,
  type CanvasGraph,
  cloneDocument,
  DEFAULT_DOCUMENT,
  DEFAULT_EFFECT_LAYER_PROPS,
  DEFAULT_EXPORT,
  DEFAULT_GLOBAL,
  DOCUMENT_SCHEMA_VERSION,
  type EffectLayer,
  type GraphMaterialNode,
  type GraphShaderNode,
  type Layer,
  LEGACY_SHADER_KINDS,
  type MaterialConfig,
  makeEmojiLayer,
  makeGraphMaterialNode,
  makeGraphShaderNode,
  makeSourceLayer,
  type PortableEnvironmentAsset,
  type PortableFontAsset,
  type PortableModelAsset,
  type PrimitiveLayer,
  SHADER_KINDS,
  type ShaderInstance,
  type ShaderKind,
  SOURCE_TYPES,
  type SourceType,
} from '../types/config';
import { makeDefaultCodeShaderInstance } from './customShaderCode';
import { shouldSplitEffectLayer, splitEffectPatchIntoPresetLayers } from './effectLayerMigration';
import { normalizeShaderPalette } from './shaderPalette';

export const DOC_KEY = 'doc';
export const PRE_BLANK_DRAFT_KEY = 'artifact-pre-blank-draft-v1';
export const ARTIFACT_FILE_EXTENSION = '.artifact.json';
export const ARTIFACT_FILE_MIME = 'application/json';

export interface InitialDocumentSources {
  search?: string;
  storageValue?: string | null;
}

export interface DocumentStorage {
  getItem?(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface PreBlankDraft {
  doc: CanvasDocument;
  savedAt: string;
  reason: 'before-blank';
  thumbnail?: string;
}

let pendingPreBlankDraft: PreBlankDraft | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isValidAspect(value: unknown): value is AspectRatio {
  return typeof value === 'string' && value in ASPECT_SIZES;
}

function normalizePrimitiveViewStates(value: unknown): CanvasGraph['primitiveViewStates'] {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value).flatMap(([id, state]) => {
    if (!isRecord(state)) return [];
    const rotationX = Number(state.rotationX);
    const rotationY = Number(state.rotationY);
    const zoom = Number(state.zoom);
    const panX = Number(state.panX);
    const panY = Number(state.panY);
    if (![rotationX, rotationY, zoom, panX, panY].every(Number.isFinite)) return [];
    return [
      [
        id,
        {
          rotationX,
          rotationY,
          zoom,
          panX,
          panY,
          locked: state.locked === true,
        },
      ],
    ] as const;
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

const MATERIAL_PERCENT_FIELDS = [
  'materialMetalness',
  'materialRoughness',
  'materialClearcoat',
  'materialRelief',
  'materialGrain',
  'materialAnisotropy',
] as const;

function isShaderKind(value: unknown): value is ShaderKind {
  return (
    typeof value === 'string' &&
    ((SHADER_KINDS as readonly string[]).includes(value) || (LEGACY_SHADER_KINDS as readonly string[]).includes(value))
  );
}

function normalizeShaderKind(value: unknown): ShaderKind {
  if (isShaderKind(value)) return value;
  switch (value) {
    case 'customSpec':
      return 'aiShader';
    case 'staticMeshGradient':
      return 'meshGradient';
    case 'pulsingBorder':
      return 'borderRings';
    case 'flutedGlass':
    case 'warp':
      return 'waves';
    case 'imageDithering':
    case 'dithering':
    case 'halftone':
    case 'halftoneDots':
    case 'halftoneCmyk':
      return 'dotGrid';
    case 'godRays':
      return 'smokeRing';
    default:
      return 'meshGradient';
  }
}

function normalizeMaterialPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return undefined;
  if (parsed > 1) return Math.min(1, Math.max(0, parsed / 100));
  return Math.min(1, Math.max(0, parsed));
}

function normalizeMaterialPatch<T extends Partial<MaterialConfig>>(value: T): T {
  const patch = { ...value };
  for (const field of MATERIAL_PERCENT_FIELDS) {
    if (field in patch) {
      const normalized = normalizeMaterialPercent(patch[field]);
      if (normalized !== undefined) patch[field] = normalized;
    }
  }
  return patch;
}

function normalizeGraph(value: unknown): CanvasGraph | undefined {
  if (!isRecord(value)) return undefined;
  const arrayField = <K extends keyof CanvasGraph>(key: K) =>
    Array.isArray(value[key]) ? (value[key] as CanvasGraph[K]) : ([] as CanvasGraph[K]);
  return {
    edges: arrayField('edges'),
    positions: isRecord(value.positions) ? (value.positions as CanvasGraph['positions']) : {},
    mergeNodes: arrayField('mergeNodes'),
    colorNodes: arrayField('colorNodes'),
    repeatNodes: normalizeRepeatNodes(arrayField('repeatNodes')),
    materialNodes: Array.isArray(value.materialNodes)
      ? value.materialNodes.filter(isRecord).map((node) =>
          makeGraphMaterialNode(
            normalizeMaterialPatch({
              ...node,
              id: String(node.id ?? `material-${Date.now()}`),
            } as Partial<GraphMaterialNode>),
          ),
        )
      : [],
    maskNodes: arrayField('maskNodes'),
    transformNodes: normalizeTransformNodes(arrayField('transformNodes')),
    grimeShadowNodes: normalizeGrimeShadowNodes(arrayField('grimeShadowNodes')),
    scene3dNodes: normalizeScene3DNodes(arrayField('scene3dNodes')),
    environmentNodes: normalizeEnvironmentNodes(arrayField('environmentNodes')),
    shaderNodes: normalizeShaderNodes(arrayField('shaderNodes')),
    areas: arrayField('areas'),
    primitiveViewStates: normalizePrimitiveViewStates(value.primitiveViewStates),
  };
}

function normalizeShaderNodes(nodes: CanvasGraph['shaderNodes']): GraphShaderNode[] {
  return (nodes ?? []).filter(isRecord).map((node) => {
    const shaderKind = normalizeShaderKind(node.shaderKind);
    const id = String(node.id ?? `shader-${Date.now()}`);
    const role =
      shaderKind === 'aiShader' ? 'effect' : node.role === 'effect' || node.role === 'fill' ? node.role : 'fill';
    const defaults = makeGraphShaderNode({ id, shaderKind, role });
    const normalizedInstance = normalizeShaderInstance(node.shaderInstance, `${id}-definition`);
    const shaderInstance =
      normalizedInstance ?? (shaderKind === 'customCode' ? makeDefaultCodeShaderInstance(id) : undefined);
    return makeGraphShaderNode({
      id,
      name: typeof node.name === 'string' ? node.name : defaults.name,
      shaderKind,
      role,
      palette: normalizeShaderPalette(shaderKind, node.palette),
      distortion:
        node.shaderKind === 'staticMeshGradient' ? 0 : normalizeShaderNumber(node.distortion, defaults.distortion),
      swirl: normalizeShaderNumber(node.swirl, defaults.swirl),
      grain: normalizeShaderNumber(node.grain, defaults.grain),
      scale: normalizeShaderNumber(node.scale, defaults.scale),
      rotation: normalizeShaderNumber(node.rotation, defaults.rotation),
      offsetX: normalizeShaderNumber(node.offsetX, defaults.offsetX),
      offsetY: normalizeShaderNumber(node.offsetY, defaults.offsetY),
      seedOffset: normalizeShaderNumber(node.seedOffset, defaults.seedOffset),
      opacity: normalizeShaderNumber(node.opacity, defaults.opacity),
      blendMode: typeof node.blendMode === 'string' ? node.blendMode : defaults.blendMode,
      ...(shaderInstance
        ? {
            shaderInstance,
          }
        : {}),
      aiPrompt: typeof node.aiPrompt === 'string' ? node.aiPrompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH) : undefined,
    });
  });
}

function normalizeShaderNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function normalizeRepeatNodes(nodes: CanvasGraph['repeatNodes']) {
  return nodes.map((node) => ({
    rotationMode: 'fixed',
    rotationStep: 0,
    rotationJitter: 0,
    seedOffset: 0,
    ...node,
  }));
}

function normalizeTransformNodes(nodes: CanvasGraph['transformNodes']) {
  return nodes.map((node) => ({
    x: 0,
    y: 0,
    scaleX: 100,
    scaleY: 100,
    uniformScale: true,
    rotation: 0,
    pivotMode: 'canvas',
    opacity: 100,
    ...node,
  }));
}

function normalizeGrimeShadowNodes(nodes: CanvasGraph['grimeShadowNodes']) {
  return nodes.map((node) => ({
    x: 8,
    y: 10,
    layers: 5,
    blur: 10,
    spread: 14,
    grime: 45,
    jitter: 10,
    opacity: 58,
    color: '#090606',
    seedOffset: 0,
    shadowOnly: false,
    ...node,
  }));
}

function normalizeScene3DNodes(nodes: CanvasGraph['scene3dNodes']) {
  return nodes.map((node) => ({
    environmentSrc: '',
    environmentName: '',
    environmentMime: '',
    environmentBytes: 0,
    materialMode: 'original',
    transparent: true,
    exposure: 100,
    environmentStrength: 100,
    environmentRotation: 0,
    ambientIntensity: 115,
    keyAzimuth: 38,
    keyElevation: 42,
    keyIntensity: 145,
    fillIntensity: 65,
    rimIntensity: 55,
    ...node,
  }));
}

function normalizeEnvironmentNodes(nodes: CanvasGraph['environmentNodes']) {
  return nodes.map((node) => ({
    environmentSrc: '',
    environmentName: '',
    environmentMime: '',
    environmentBytes: 0,
    ...node,
  }));
}

function normalizePortableFontAssets(value: unknown): PortableFontAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableFontAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableModelAssets(value: unknown): PortableModelAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableModelAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableEnvironmentAssets(value: unknown): PortableEnvironmentAsset[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const assets = value.flatMap((item) => {
    const asset = normalizePortableEnvironmentAsset(item);
    return asset ? [asset] : [];
  });
  return assets.length > 0 ? assets : undefined;
}

function normalizePortableEnvironmentAsset(item: unknown): PortableEnvironmentAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'image/x-exr',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported environment',
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
  };
}

function normalizePortableModelAsset(item: unknown): PortableModelAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'model/gltf-binary',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported model',
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
  };
}

function normalizePortableFontAsset(item: unknown): PortableFontAsset | null {
  if (!isRecord(item)) return null;
  const id = stringField(item.id);
  const dataUrl = stringField(item.dataUrl);
  if (!id || !dataUrl?.startsWith('data:')) return null;
  return {
    id,
    dataUrl,
    mime: stringField(item.mime) ?? 'application/octet-stream',
    bytes: finiteNumberField(item.bytes),
    label: stringField(item.label) ?? 'Imported Font',
    family: stringField(item.family) ?? `Artifact Imported ${id}`,
    createdAt: stringField(item.createdAt) ?? new Date(0).toISOString(),
    ...fontAssetSourceFields(item),
    ...fontAssetLicenseField(item.license),
    ...fontAssetEmbeddingPolicyField(item.embeddingPolicy),
  };
}

function stringField(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumberField(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fontAssetSourceFields(item: Record<string, unknown>): Partial<PortableFontAsset> {
  return {
    ...(item.source === 'local-file' || item.source === 'google-fonts' ? { source: item.source } : {}),
    ...(typeof item.sourceName === 'string' ? { sourceName: item.sourceName } : {}),
    ...(typeof item.sourceUrl === 'string' ? { sourceUrl: item.sourceUrl } : {}),
  };
}

function fontAssetLicenseField(license: unknown): Pick<PortableFontAsset, 'license'> | Record<string, never> {
  if (!isRecord(license) || typeof license.name !== 'string') return {};
  return {
    license: {
      name: license.name,
      ...(typeof license.url === 'string' ? { url: license.url } : {}),
      ...(typeof license.allowsEmbedding === 'boolean' ? { allowsEmbedding: license.allowsEmbedding } : {}),
    },
  };
}

function fontAssetEmbeddingPolicyField(
  embeddingPolicy: unknown,
): Pick<PortableFontAsset, 'embeddingPolicy'> | Record<string, never> {
  return embeddingPolicy === 'user-confirmed-required' || embeddingPolicy === 'open-license-embeddable'
    ? { embeddingPolicy }
    : {};
}

export function normalizeDocument(raw: unknown): CanvasDocument {
  const doc = migrateDocumentSchema(isRecord(raw) ? raw : {});
  const global = isRecord(doc.global) ? doc.global : {};
  const exportConfig = isRecord(doc.export) ? doc.export : {};
  const aspect = isValidAspect(global.aspect) ? global.aspect : DEFAULT_GLOBAL.aspect;
  const layers = Array.isArray(doc.layers)
    ? (doc.layers.filter(isRecord).flatMap((layer) => {
        const normalizedLayer =
          layer.kind === 'source' && typeof layer.sourceType === 'string'
            ? { ...layer, kind: layer.sourceType as SourceType }
            : layer;
        const layerWithDefaults =
          normalizedLayer.kind === 'effect'
            ? ({
                ...DEFAULT_EFFECT_LAYER_PROPS,
                ...normalizedLayer,
              } as Partial<EffectLayer>)
            : SOURCE_TYPES.includes(normalizedLayer.kind as SourceType)
              ? {
                  ...makeSourceLayer(normalizedLayer.kind as SourceType),
                  ...normalizedLayer,
                }
              : normalizedLayer.kind === 'emoji'
                ? { ...makeEmojiLayer(), ...normalizedLayer }
                : normalizedLayer;
        const layerWithMaterial =
          layerWithDefaults.kind === 'primitive'
            ? ({
                ...layerWithDefaults,
                ...normalizeMaterialPatch(layerWithDefaults as Partial<PrimitiveLayer>),
              } as Layer)
            : layerWithDefaults;

        if (layerWithMaterial.kind === 'effect' && shouldSplitEffectLayer(layerWithMaterial as Partial<EffectLayer>)) {
          return splitEffectPatchIntoPresetLayers(layerWithMaterial as Partial<EffectLayer>, {
            idPrefix: String(layerWithMaterial.id ?? 'effect'),
          });
        }

        return [layerWithMaterial as Layer];
      }) as Layer[])
    : [];

  const fontAssets = normalizePortableFontAssets(doc.fontAssets);
  const modelAssets = normalizePortableModelAssets(doc.modelAssets);
  const envAssets = normalizePortableEnvironmentAssets(doc.envAssets);
  const documentFields = { ...(doc as Partial<CanvasDocument>) };
  delete documentFields.fontAssets;
  delete documentFields.modelAssets;
  delete documentFields.envAssets;
  return {
    ...documentFields,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, ...global, aspect },
    layers,
    export: { ...DEFAULT_EXPORT, ...exportConfig } as CanvasDocument['export'],
    graph: normalizeGraph(doc.graph),
    ...(fontAssets ? { fontAssets } : {}),
    ...(modelAssets ? { modelAssets } : {}),
    ...(envAssets ? { envAssets } : {}),
  };
}

function migrateDocumentSchema(raw: Record<string, unknown>): Record<string, unknown> {
  const schemaVersion = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 1;
  if (schemaVersion > DOCUMENT_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported document schema version ${schemaVersion}; this build supports up to ${DOCUMENT_SCHEMA_VERSION}.`,
    );
  }
  let migrated = raw;
  if (schemaVersion < 2) migrated = migrateDocumentV1ToV2(migrated);
  if (schemaVersion < 3) migrated = migrateDocumentV2ToV3(migrated);
  return migrated;
}

function migrateDocumentV1ToV2(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.graph)) return { ...raw, schemaVersion: 2 };
  const graph = raw.graph;
  const edges = Array.isArray(graph.edges) ? graph.edges.filter(isRecord) : [];
  const shaderNodes = Array.isArray(graph.shaderNodes)
    ? graph.shaderNodes.filter(isRecord).map((node) => {
        const id = String(node.id ?? `shader-${Date.now()}`);
        const shaderKind = normalizeShaderKind(node.shaderKind);
        const hasBackdrop = edges.some((edge) => edge.toId === id && edge.toPort === 'bg');
        const role =
          shaderKind === 'aiShader'
            ? 'effect'
            : node.role === 'effect' || node.role === 'fill'
              ? node.role
              : hasBackdrop
                ? 'effect'
                : 'fill';
        const { customShaderCode, ...nodeFields } = node;
        if (shaderKind !== 'customCode' || node.shaderInstance) return { ...nodeFields, role };
        const instance = makeDefaultCodeShaderInstance(id);
        const code =
          isRecord(customShaderCode) && typeof customShaderCode.code === 'string' ? customShaderCode.code : '';
        return {
          ...nodeFields,
          role,
          shaderInstance: {
            ...instance,
            definition: { ...instance.definition, code: code.slice(0, 12_000) },
          },
        };
      })
    : [];
  return {
    ...raw,
    schemaVersion: 2,
    graph: { ...graph, shaderNodes },
  };
}

function migrateDocumentV2ToV3(raw: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(raw.graph)) return { ...raw, schemaVersion: 3 };
  const graph = raw.graph;
  const shaderNodes = Array.isArray(graph.shaderNodes)
    ? graph.shaderNodes.filter(isRecord).map((node) => {
        const id = String(node.id ?? `shader-${Date.now()}`);
        const migratedInstance = migrateLegacyAiShaderInstance(node, id);
        const nodeFields = { ...node };
        delete nodeFields.customShaderSpec;
        return {
          ...nodeFields,
          shaderKind: node.shaderKind === 'customSpec' ? 'aiShader' : node.shaderKind,
          ...(migratedInstance ? { shaderInstance: migratedInstance } : {}),
        };
      })
    : [];
  return {
    ...raw,
    schemaVersion: 3,
    graph: { ...graph, shaderNodes },
  };
}

function migrateLegacyAiShaderInstance(node: Record<string, unknown>, id: string): ShaderInstance | undefined {
  if (node.shaderInstance || !isRecord(node.customShaderSpec)) return undefined;
  if (node.shaderKind !== 'customSpec' && node.shaderKind !== 'aiShader') return undefined;
  const spec = node.customShaderSpec;
  const prompt =
    typeof node.aiPrompt === 'string'
      ? node.aiPrompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH)
      : typeof spec.prompt === 'string'
        ? spec.prompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH)
        : undefined;
  const palette = normalizeShaderPalette('aiShader', spec.palette);
  const code = legacyAiShaderSpecToGlsl(spec, palette);
  return {
    definition: {
      version: 1,
      id: `${id}-migrated-definition`,
      label: typeof spec.label === 'string' && spec.label.trim() ? spec.label.slice(0, 80) : 'Migrated AI Shader',
      language: 'glsl-fragment',
      code,
      properties: [],
      provenance: { source: 'localFallback', prompt, model: 'legacy-operation-migration' },
    },
    values: {},
  };
}

function legacyAiShaderSpecToGlsl(spec: Record<string, unknown>, palette: string[]) {
  const operations = Array.isArray(spec.operations)
    ? spec.operations
        .map(normalizeLegacyShaderOperation)
        .filter((operation): operation is Record<string, unknown> => Boolean(operation))
        .slice(0, 12)
    : [];
  const normalizedOperations =
    operations.length > 0
      ? operations
      : [
          { op: 'noise', scale: 3.2, amount: 0.34, octaves: 4, seedOffset: 0 },
          { op: 'wave', frequency: 7.5, amplitude: 0.22, angle: 28, phase: 0 },
          { op: 'swirl', amount: 0.18, radius: 1.25 },
        ];
  const operationCode = normalizedOperations.map(legacyAiShaderOperationToGlsl).filter(Boolean).join('\n  ');
  const colors = palette.length > 0 ? palette : ['#ffffff'];
  return `
float legacyHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7)) + u_seed * 0.017) * 43758.5453);
}
float legacyNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(legacyHash(i), legacyHash(i + vec2(1.0, 0.0)), u.x),
    mix(legacyHash(i + vec2(0.0, 1.0)), legacyHash(i + vec2(1.0)), u.x), u.y);
}
float legacyFbm(vec2 p, float octaves, float seedOffset) {
  float value = 0.0;
  float amplitude = 0.5;
  float normalization = 0.0;
  for (int octave = 0; octave < 7; octave++) {
    if (float(octave) < octaves) {
      value += legacyNoise(p + seedOffset * 0.001 + float(octave) * 0.13) * amplitude;
      normalization += amplitude;
    }
    p *= 2.0;
    amplitude *= 0.5;
  }
  return normalization > 0.0 ? value / normalization : 0.0;
}
float legacyLuma(vec3 color) { return dot(color, vec3(0.2126, 0.7152, 0.0722)); }
float legacySmoothstep(float edge0, float edge1, float value) {
  float normalized = clamp((value - edge0) / (edge1 - edge0), 0.0, 1.0);
  return normalized * normalized * (3.0 - 2.0 * normalized);
}
vec3 legacyPalette(float value) {
  value = clamp(value, 0.0, 0.9999);
  ${legacyPaletteSampler(colors)}
}
vec4 mainImage(vec2 uv) {
  vec4 source = texture2D(u_backdrop, uv);
  vec2 point = (uv * 2.0 - 1.0) * vec2(u_resolution.x / max(1.0, u_resolution.y), 1.0);
  float radius = length(point);
  float angle = atan(point.y, point.x);
  float tone = ${legacyClampedNumber(spec.base, 0, 1, 0.46)};
  float contrast = ${legacyClampedNumber(spec.contrast, 0.1, 4, 1.18)};
  vec3 color = source.rgb;
  float mapped = 0.0;
  ${operationCode}
  vec3 proceduralColor = legacyPalette(clamp((tone - 0.5) * contrast + 0.5, 0.0, 1.0));
  color = mix(color, proceduralColor, mapped > 0.5 ? 0.074 : 0.37);
  return vec4(color, source.a);
}`.trim();
}

function normalizeLegacyShaderOperation(operation: unknown): Record<string, unknown> | null {
  if (!isRecord(operation)) return null;
  switch (operation.op) {
    case 'noise':
      return {
        op: 'noise',
        scale: legacyClamp(operation.scale, 0.1, 40, 3),
        amount: legacyClamp(operation.amount, -2, 2, 0.3),
        octaves: Math.round(legacyClamp(operation.octaves, 1, 7, 4)),
        seedOffset: Math.round(legacyClamp(operation.seedOffset, 0, 9999, 0)),
      };
    case 'wave':
      return {
        op: 'wave',
        frequency: legacyClamp(operation.frequency, 0.1, 80, 8),
        amplitude: legacyClamp(operation.amplitude, -2, 2, 0.2),
        angle: legacyClamp(operation.angle, -360, 360, 0),
        phase: legacyClamp(operation.phase, -Math.PI * 8, Math.PI * 8, 0),
      };
    case 'rings':
      return {
        op: 'rings',
        frequency: legacyClamp(operation.frequency, 0.1, 80, 12),
        amount: legacyClamp(operation.amount, -2, 2, 0.24),
        centerX: legacyClamp(operation.centerX, -1, 1, 0),
        centerY: legacyClamp(operation.centerY, -1, 1, 0),
      };
    case 'swirl':
      return {
        op: 'swirl',
        amount: legacyClamp(operation.amount, -2, 2, 0.2),
        radius: legacyClamp(operation.radius, 0.05, 4, 1.1),
      };
    case 'threshold':
      return {
        op: 'threshold',
        value: legacyClamp(operation.value, 0, 1, 0.5),
        softness: legacyClamp(operation.softness, 0, 1, 0.08),
      };
    case 'posterize':
      return { op: 'posterize', steps: Math.round(legacyClamp(operation.steps, 2, 16, 4)) };
    case 'invert':
      return { op: 'invert', amount: legacyClamp(operation.amount, 0, 1, 1) };
    case 'sourceLuma':
      return { op: 'sourceLuma', amount: legacyClamp(operation.amount, 0, 1, 0.45) };
    case 'edgeGlow':
      return {
        op: 'edgeGlow',
        amount: legacyClamp(operation.amount, 0, 2, 0.35),
        softness: legacyClamp(operation.softness, 0, 1, 0.18),
      };
    case 'chromaticShift':
      return {
        op: 'chromaticShift',
        amount: legacyClamp(operation.amount, 0, 1, 0.24),
        angle: legacyClamp(operation.angle, -360, 360, 0),
      };
    case 'gradientMap':
      return { op: 'gradientMap', amount: legacyClamp(operation.amount, 0, 1, 0.65) };
    default:
      return null;
  }
}

function legacyAiShaderOperationToGlsl(operation: Record<string, unknown>) {
  switch (operation.op) {
    case 'noise':
      return `tone += (legacyFbm(point * ${legacyNumber(operation.scale, 4)}, ${legacyNumber(operation.octaves, 4)}, ${legacyNumber(operation.seedOffset, 0)}) - 0.5) * ${legacyNumber(operation.amount, 0)};`;
    case 'wave': {
      const direction = (legacyFiniteNumber(operation.angle, 0) * Math.PI) / 180;
      return `tone += sin(dot(point, vec2(${Math.cos(direction).toFixed(8)}, ${Math.sin(direction).toFixed(8)})) * ${legacyNumber(operation.frequency, 1)} + ${legacyNumber(operation.phase, 0)}) * ${legacyNumber(operation.amplitude, 0)};`;
    }
    case 'rings':
      return `tone += sin(length(point - vec2(${legacyNumber(operation.centerX, 0)}, ${legacyNumber(operation.centerY, 0)})) * ${legacyNumber(operation.frequency, 1)}) * ${legacyNumber(operation.amount, 0)};`;
    case 'swirl':
      return `tone += sin(angle + radius * max(0.05, ${legacyNumber(operation.radius, 1)}) * 8.0) * ${legacyNumber(operation.amount, 0)} * legacySmoothstep(1.7, 0.02, radius);`;
    case 'threshold':
      return `tone = smoothstep(${legacyNumber(operation.value, 0.5)} - ${legacyNumber(operation.softness, 0.08)}, ${legacyNumber(operation.value, 0.5)} + ${legacyNumber(operation.softness, 0.08)}, tone);`;
    case 'posterize':
      return `tone = floor(clamp(tone, 0.0, 1.0) * (max(2.0, ${legacyNumber(operation.steps, 2)}) - 1.0) + 0.5) / (max(2.0, ${legacyNumber(operation.steps, 2)}) - 1.0);`;
    case 'invert':
      return `tone = mix(tone, 1.0 - tone, ${legacyNumber(operation.amount, 0)});`;
    case 'sourceLuma':
      return `tone = mix(tone, legacyLuma(source.rgb), ${legacyNumber(operation.amount, 0)});`;
    case 'edgeGlow':
      return `{
    vec2 pixel = 1.0 / max(u_resolution, vec2(1.0));
    float horizontal = legacyLuma(texture2D(u_backdrop, uv + vec2(pixel.x, 0.0)).rgb) - legacyLuma(texture2D(u_backdrop, uv - vec2(pixel.x, 0.0)).rgb);
    float vertical = legacyLuma(texture2D(u_backdrop, uv + vec2(0.0, pixel.y)).rgb) - legacyLuma(texture2D(u_backdrop, uv - vec2(0.0, pixel.y)).rgb);
    float edge = smoothstep(${legacyNumber(operation.softness, 0.18)}, 1.0, clamp((abs(horizontal) + abs(vertical)) * 3.0, 0.0, 1.0));
    tone += edge * ${legacyNumber(operation.amount, 0)} * 0.5;
    color += legacyPalette(clamp(tone, 0.0, 1.0)) * edge * ${legacyNumber(operation.amount, 0)} * 0.35;
  }`;
    case 'chromaticShift': {
      const direction = (legacyFiniteNumber(operation.angle, 0) * Math.PI) / 180;
      const amount = legacyFiniteNumber(operation.amount, 0) * 0.028;
      return `{
    float shortSide = min(u_resolution.x, u_resolution.y);
    vec2 shift = vec2(${(Math.cos(direction) * amount).toFixed(8)}, ${(Math.sin(direction) * amount).toFixed(8)}) * shortSide / max(u_resolution, vec2(1.0));
    color.r = texture2D(u_backdrop, clamp(uv + shift, 0.0, 1.0)).r;
    color.b = texture2D(u_backdrop, clamp(uv - shift, 0.0, 1.0)).b;
  }`;
    }
    case 'gradientMap':
      return `color = mix(color, legacyPalette(clamp((tone - 0.5) * contrast + 0.5, 0.0, 1.0)), ${legacyNumber(operation.amount, 0)}); mapped = 1.0;`;
    default:
      return '';
  }
}

function legacyPaletteSampler(palette: string[]) {
  if (palette.length === 1) return `return ${legacyHexToGlsl(palette[0]!)};`;
  const last = palette.length - 1;
  const clauses = palette.slice(0, -1).map((color, index) => {
    const start = index / last;
    const end = (index + 1) / last;
    return `if (value <= ${end.toFixed(8)}) return mix(${legacyHexToGlsl(color)}, ${legacyHexToGlsl(palette[index + 1]!)}, (value - ${start.toFixed(8)}) / ${(end - start).toFixed(8)});`;
  });
  return `${clauses.join('\n  ')}\n  return ${legacyHexToGlsl(palette[last]!)};`;
}

function legacyHexToGlsl(color: string) {
  const value = Number.parseInt(color.replace('#', ''), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  return `vec3(${red.toFixed(8)}, ${green.toFixed(8)}, ${blue.toFixed(8)})`;
}

function legacyFiniteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function legacyClamp(value: unknown, min: number, max: number, fallback: number) {
  return Math.min(max, Math.max(min, legacyFiniteNumber(Number(value), fallback)));
}

function legacyClampedNumber(value: unknown, min: number, max: number, fallback: number) {
  return legacyClamp(value, min, max, fallback).toFixed(8);
}

function legacyNumber(value: unknown, fallback: number) {
  return legacyFiniteNumber(value, fallback).toFixed(8);
}

function parseDocumentJson(value: string | null | undefined): CanvasDocument | null {
  if (!value) return null;
  try {
    return normalizeDocument(JSON.parse(value));
  } catch {
    return null;
  }
}

export function serializeDocument(doc: CanvasDocument) {
  return JSON.stringify(doc);
}

export function serializeArtifactDocument(doc: CanvasDocument) {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function createBlankDocument({
  aspect = DEFAULT_GLOBAL.aspect,
  seed = DEFAULT_GLOBAL.seed,
}: Partial<Pick<CanvasDocument['global'], 'aspect' | 'seed'>> = {}): CanvasDocument {
  return {
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    global: { ...DEFAULT_GLOBAL, bg: 'transparent', aspect, seed },
    layers: [],
    export: { ...DEFAULT_EXPORT },
  };
}

export function isBlankDocument(doc: CanvasDocument) {
  const graph = doc.graph;
  const graphIsEmpty =
    !graph ||
    (graph.edges.length === 0 &&
      graph.mergeNodes.length === 0 &&
      (graph.colorNodes ?? []).length === 0 &&
      (graph.repeatNodes ?? []).length === 0 &&
      (graph.materialNodes ?? []).length === 0 &&
      (graph.maskNodes ?? []).length === 0 &&
      (graph.transformNodes ?? []).length === 0 &&
      (graph.grimeShadowNodes ?? []).length === 0 &&
      (graph.scene3dNodes ?? []).length === 0 &&
      (graph.environmentNodes ?? []).length === 0 &&
      (graph.shaderNodes ?? []).length === 0 &&
      (graph.areas ?? []).length === 0 &&
      Object.keys(graph.positions).every((id) => id === '__export__'));

  return doc.layers.length === 0 && doc.global.bg === 'transparent' && graphIsEmpty;
}

export function parseArtifactDocument(value: string | null | undefined): CanvasDocument | null {
  return parseDocumentJson(value);
}

export function takePendingPreBlankDraft(): PreBlankDraft | null {
  const draft = pendingPreBlankDraft;
  pendingPreBlankDraft = null;
  return draft;
}

function parsePreBlankDraft(value: string | null | undefined): PreBlankDraft | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<PreBlankDraft>;
    if (parsed.reason !== 'before-blank' || typeof parsed.savedAt !== 'string') return null;
    return {
      reason: 'before-blank',
      savedAt: parsed.savedAt,
      doc: normalizeDocument(parsed.doc),
      ...(typeof parsed.thumbnail === 'string' ? { thumbnail: parsed.thumbnail } : {}),
    };
  } catch {
    return null;
  }
}

export function loadPreBlankDraft(storage: Pick<DocumentStorage, 'getItem'>): PreBlankDraft | null {
  try {
    return parsePreBlankDraft(storage.getItem?.(PRE_BLANK_DRAFT_KEY));
  } catch {
    return null;
  }
}

export function savePreBlankDraft(
  doc: CanvasDocument,
  storage: Pick<DocumentStorage, 'setItem'> = localStorage,
  date = new Date(),
  thumbnail?: string,
) {
  if (isBlankDocument(doc)) return true;
  try {
    storage.setItem(
      PRE_BLANK_DRAFT_KEY,
      JSON.stringify({
        reason: 'before-blank',
        savedAt: date.toISOString(),
        doc,
        ...(thumbnail ? { thumbnail } : {}),
      }),
    );
    return true;
  } catch {
    return false;
  }
}

export function deletePreBlankDraft(storage: Pick<DocumentStorage, 'removeItem'> = localStorage) {
  try {
    storage.removeItem?.(PRE_BLANK_DRAFT_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createArtifactFileName(doc: CanvasDocument, date = new Date()) {
  const seed = Number.isFinite(doc.global.seed) ? doc.global.seed : 'untitled';
  const stamp = date.toISOString().slice(0, 10);
  return `artifact-${seed}-${stamp}${ARTIFACT_FILE_EXTENSION}`;
}

export function getInitialDocumentFromSources({ search = '', storageValue = null }: InitialDocumentSources) {
  const params = new URLSearchParams(search);
  if (params.get('new') === 'blank' || params.get('blank') === '1') return createBlankDocument();

  const docParam = params.get('doc');
  return parseDocumentJson(docParam) ?? parseDocumentJson(storageValue) ?? cloneDocument(DEFAULT_DOCUMENT);
}

export function getInitialDocument(): CanvasDocument {
  let storageValue: string | null = null;
  try {
    storageValue = localStorage.getItem(DOC_KEY);
  } catch {
    // ignore inaccessible storage
  }

  const search = typeof window === 'undefined' ? '' : window.location.search;
  const params = new URLSearchParams(search);
  const startsBlank = params.get('new') === 'blank' || params.get('blank') === '1';
  if (startsBlank) {
    const storedDoc = parseArtifactDocument(storageValue);
    if (storedDoc && !isBlankDocument(storedDoc)) {
      pendingPreBlankDraft = {
        reason: 'before-blank',
        savedAt: new Date().toISOString(),
        doc: storedDoc,
      };
    }
  }

  return getInitialDocumentFromSources({
    search,
    storageValue,
  });
}

export function saveDocumentToStorage(doc: CanvasDocument, storage: DocumentStorage = localStorage) {
  try {
    storage.setItem(DOC_KEY, serializeDocument(doc));
    return true;
  } catch {
    return false;
  }
}

export function createDocumentShareUrl(origin: string, doc: CanvasDocument, pathname = '/app') {
  const params = new URLSearchParams();
  params.set('doc', serializeDocument(doc));
  return `${origin}${pathname}?${params.toString()}`;
}

export function removeDocParamFromUrl(href: string) {
  const url = new URL(href);
  url.searchParams.delete('doc');
  url.searchParams.delete('new');
  url.searchParams.delete('blank');
  return url.toString();
}
