export const AI_API_PATHS = {
  health: '/api/health',
  access: '/api/ai/access',
  shaderSpec: '/api/ai/shader-spec',
  generations: '/api/ai/generations',
  generation: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}`,
  generationCancel: (id: string) => `/api/ai/generations/${encodeURIComponent(id)}/cancel`,
  assetFile: (id: string) => `/api/assets/${encodeURIComponent(id)}/file`,
} as const;

export const AI_GENERATION_PROVIDERS = ['openai', 'xai'] as const;
export type AiGenerationProvider = (typeof AI_GENERATION_PROVIDERS)[number];

export const AI_GENERATION_JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type AiGenerationJobStatus = (typeof AI_GENERATION_JOB_STATUSES)[number];

export const AI_GENERATION_QUALITIES = ['draft', 'standard', 'high'] as const;
export type AiGenerationQuality = (typeof AI_GENERATION_QUALITIES)[number];

export const AI_GENERATION_ASPECT_RATIOS = ['1:1', '4:5', '9:16', '16:9'] as const;
export type AiGenerationAspectRatio = (typeof AI_GENERATION_ASPECT_RATIOS)[number];

export interface AiGenerationSettings {
  aspect: AiGenerationAspectRatio;
  quality: AiGenerationQuality;
  stylePreset?: string;
  negativePrompt?: string;
  sourceAssetId?: string;
}

export interface CreateAiGenerationRequest {
  prompt: string;
  provider?: AiGenerationProvider;
  model?: string;
  settings: AiGenerationSettings;
  idempotencyKey: string;
}

export const SHADER_ROLES = ['fill', 'effect'] as const;
export type ShaderRole = (typeof SHADER_ROLES)[number];

export const SHADER_PROPERTY_TYPES = ['number', 'boolean', 'color'] as const;
export type ShaderPropertyType = (typeof SHADER_PROPERTY_TYPES)[number];
export type ShaderPropertyValue = number | boolean | string;

interface ShaderPropertyDefinitionBase {
  key: string;
  label: string;
  description?: string;
}

export interface ShaderNumberPropertyDefinition extends ShaderPropertyDefinitionBase {
  type: 'number';
  default: number;
  min: number;
  max: number;
  step: number;
}

export interface ShaderBooleanPropertyDefinition extends ShaderPropertyDefinitionBase {
  type: 'boolean';
  default: boolean;
}

export interface ShaderColorPropertyDefinition extends ShaderPropertyDefinitionBase {
  type: 'color';
  default: string;
}

export type ShaderPropertyDefinition =
  | ShaderNumberPropertyDefinition
  | ShaderBooleanPropertyDefinition
  | ShaderColorPropertyDefinition;

export interface ShaderDefinitionProvenance {
  source: 'manual' | 'openai' | 'localFallback';
  prompt?: string;
  model?: string;
}

/** A reusable, serializable shader program. A graph node owns only an instance of this definition. */
export interface ShaderDefinition {
  version: 1;
  id: string;
  label: string;
  language: 'glsl-fragment';
  code: string;
  properties: ShaderPropertyDefinition[];
  provenance?: ShaderDefinitionProvenance;
}

export interface ShaderInstance {
  definition: ShaderDefinition;
  values: Record<string, ShaderPropertyValue>;
}

export type CustomShaderOperation =
  | {
      op: 'noise';
      scale: number;
      amount: number;
      octaves?: number;
      seedOffset?: number;
    }
  | {
      op: 'wave';
      frequency: number;
      amplitude: number;
      angle: number;
      phase?: number;
    }
  | {
      op: 'rings';
      frequency: number;
      amount: number;
      centerX?: number;
      centerY?: number;
    }
  | {
      op: 'swirl';
      amount: number;
      radius?: number;
    }
  | {
      op: 'threshold';
      value: number;
      softness?: number;
    }
  | {
      op: 'posterize';
      steps: number;
    }
  | {
      op: 'invert';
      amount: number;
    }
  | {
      op: 'sourceLuma';
      amount: number;
    }
  | {
      op: 'edgeGlow';
      amount: number;
      softness?: number;
    }
  | {
      op: 'chromaticShift';
      amount: number;
      angle?: number;
    }
  | {
      op: 'gradientMap';
      amount: number;
    };

export const AI_SHADER_SPEC_SOURCES = ['openai', 'localFallback'] as const;
export type AiShaderSpecSource = (typeof AI_SHADER_SPEC_SOURCES)[number];

export const AI_SHADER_SPEC_REQUEST_MODES = ['openai', 'localFallback'] as const;
export type AiShaderSpecRequestMode = (typeof AI_SHADER_SPEC_REQUEST_MODES)[number];
export const AI_SHADER_PROMPT_MAX_LENGTH = 1_500;

export interface CustomShaderProvenance {
  source: AiShaderSpecSource;
  model?: string;
}

export interface CustomShaderSpec {
  version: 2;
  label?: string;
  prompt?: string;
  base?: number;
  contrast?: number;
  palette?: string[];
  provenance?: CustomShaderProvenance;
  operations: CustomShaderOperation[];
}

export interface CreateAiShaderSpecRequest {
  prompt: string;
  mode?: AiShaderSpecRequestMode;
  idempotencyKey: string;
}

export interface AiShaderSpecGenerationResponse {
  prompt: string;
  spec: CustomShaderSpec;
  source: AiShaderSpecSource;
  model?: string;
  warnings?: string[];
}

const CUSTOM_SHADER_HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const SHADER_PROPERTY_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,39}$/;
const MAX_SHADER_DEFINITION_PROPERTIES = 12;

export function normalizeShaderDefinition(value: unknown, fallbackId = 'shader-definition'): ShaderDefinition | null {
  if (!isCustomShaderRecord(value)) return null;
  const properties = Array.isArray(value.properties)
    ? value.properties
        .map(normalizeShaderPropertyDefinition)
        .filter((property): property is ShaderPropertyDefinition => Boolean(property))
        .filter((property, index, all) => all.findIndex((candidate) => candidate.key === property.key) === index)
        .slice(0, MAX_SHADER_DEFINITION_PROPERTIES)
    : [];
  return {
    version: 1,
    id: normalizeShaderText(value.id, fallbackId, 120),
    label: normalizeShaderText(value.label, 'Untitled Shader', 80),
    language: 'glsl-fragment',
    code: typeof value.code === 'string' ? value.code.slice(0, 12_000) : '',
    properties,
    provenance: normalizeShaderDefinitionProvenance(value.provenance),
  };
}

export function normalizeShaderInstance(value: unknown, fallbackId = 'shader-definition'): ShaderInstance | null {
  if (!isCustomShaderRecord(value)) return null;
  const definition = normalizeShaderDefinition(value.definition, fallbackId);
  if (!definition) return null;
  return {
    definition,
    values: normalizeShaderPropertyValues(definition, value.values),
  };
}

export function normalizeShaderPropertyValues(
  definition: ShaderDefinition,
  value: unknown,
): Record<string, ShaderPropertyValue> {
  const values = isCustomShaderRecord(value) ? value : {};
  return Object.fromEntries(
    definition.properties.map((property) => [
      property.key,
      normalizeShaderPropertyValue(property, values[property.key]),
    ]),
  );
}

export function validateShaderDefinition(value: unknown): string[] {
  if (!isCustomShaderRecord(value)) return ['Shader definition must be an object.'];
  const errors: string[] = [];
  if (value.version !== 1) errors.push('Shader definition version must be 1.');
  if (value.language !== 'glsl-fragment') errors.push('Shader language must be glsl-fragment.');
  if (typeof value.code !== 'string') errors.push('Shader code must be a string.');
  if (typeof value.code === 'string' && value.code.length > 12_000)
    errors.push('Keep shader code under 12,000 characters.');
  if (!Array.isArray(value.properties)) {
    errors.push('Shader properties must be an array.');
    return errors;
  }
  if (value.properties.length > MAX_SHADER_DEFINITION_PROPERTIES)
    errors.push(`Use ${MAX_SHADER_DEFINITION_PROPERTIES} shader properties or fewer.`);
  const keys = new Set<string>();
  value.properties.forEach((property, index) => {
    const normalized = normalizeShaderPropertyDefinition(property);
    if (!normalized) {
      errors.push(`Shader property ${index + 1} is invalid.`);
      return;
    }
    shaderPropertyValidationErrors(property).forEach((error) => errors.push(`Shader property ${index + 1}: ${error}`));
    if (keys.has(normalized.key)) errors.push(`Shader property key ${normalized.key} is duplicated.`);
    keys.add(normalized.key);
  });
  return errors;
}

function shaderPropertyValidationErrors(value: unknown): string[] {
  if (!isCustomShaderRecord(value)) return ['definition must be an object.'];
  switch (value.type) {
    case 'number': {
      const numbers = [value.default, value.min, value.max, value.step];
      if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number)))
        return ['number fields must be finite numbers.'];
      const errors: string[] = [];
      if ((value.min as number) > (value.max as number)) errors.push('minimum must not exceed maximum.');
      if ((value.step as number) <= 0) errors.push('step must be greater than zero.');
      if ((value.default as number) < (value.min as number) || (value.default as number) > (value.max as number))
        errors.push('default must be inside the allowed range.');
      return errors;
    }
    case 'boolean':
      return typeof value.default === 'boolean' ? [] : ['default must be true or false.'];
    case 'color':
      return typeof value.default === 'string' && CUSTOM_SHADER_HEX_COLOR_RE.test(value.default)
        ? []
        : ['default must be a hex color.'];
    default:
      return ['type is not supported.'];
  }
}

function normalizeShaderPropertyDefinition(value: unknown): ShaderPropertyDefinition | null {
  if (!isCustomShaderRecord(value) || !SHADER_PROPERTY_KEY_RE.test(String(value.key ?? ''))) return null;
  const key = String(value.key);
  const label = normalizeShaderText(value.label, humanizeShaderPropertyKey(key), 60);
  const description = typeof value.description === 'string' ? value.description.slice(0, 180) : undefined;
  switch (value.type) {
    case 'number': {
      const min = finiteShaderNumber(value.min, 0);
      const max = Math.max(min, finiteShaderNumber(value.max, 1));
      const step = Math.max(0.0001, finiteShaderNumber(value.step, Math.max((max - min) / 100, 0.01)));
      return {
        type: 'number',
        key,
        label,
        description,
        min,
        max,
        step,
        default: clampCustomShaderNumber(value.default, min, max, min),
      };
    }
    case 'boolean':
      return { type: 'boolean', key, label, description, default: value.default === true };
    case 'color':
      return {
        type: 'color',
        key,
        label,
        description,
        default:
          typeof value.default === 'string' && CUSTOM_SHADER_HEX_COLOR_RE.test(value.default)
            ? value.default
            : '#ffffff',
      };
    default:
      return null;
  }
}

function normalizeShaderPropertyValue(property: ShaderPropertyDefinition, value: unknown): ShaderPropertyValue {
  switch (property.type) {
    case 'number':
      return clampCustomShaderNumber(value, property.min, property.max, property.default);
    case 'boolean':
      return typeof value === 'boolean' ? value : property.default;
    case 'color':
      return typeof value === 'string' && CUSTOM_SHADER_HEX_COLOR_RE.test(value) ? value : property.default;
  }
}

function normalizeShaderDefinitionProvenance(value: unknown): ShaderDefinitionProvenance | undefined {
  if (!isCustomShaderRecord(value)) return undefined;
  if (!['manual', 'openai', 'localFallback'].includes(String(value.source))) return undefined;
  return {
    source: value.source as ShaderDefinitionProvenance['source'],
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH) : undefined,
    model: typeof value.model === 'string' ? value.model.slice(0, 120) : undefined,
  };
}

function normalizeShaderText(value: unknown, fallback: string, maxLength: number) {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, maxLength) : fallback;
}

function humanizeShaderPropertyKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function finiteShaderNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export const DEFAULT_CUSTOM_SHADER_SPEC: CustomShaderSpec = {
  version: 2,
  label: 'AI Shader Effect',
  base: 0.46,
  contrast: 1.18,
  palette: ['#0d1020', '#7b61ff', '#56f0c6', '#fff1a8'],
  operations: [
    { op: 'noise', scale: 3.2, amount: 0.34, octaves: 4 },
    { op: 'wave', frequency: 7.5, amplitude: 0.22, angle: 28 },
    { op: 'swirl', amount: 0.18, radius: 1.25 },
  ],
};

export function cloneDefaultCustomShaderSpec(): CustomShaderSpec {
  return {
    ...DEFAULT_CUSTOM_SHADER_SPEC,
    palette: [...(DEFAULT_CUSTOM_SHADER_SPEC.palette ?? [])],
    operations: DEFAULT_CUSTOM_SHADER_SPEC.operations.map((operation) => ({ ...operation })),
  };
}

export function normalizeCustomShaderSpec(value: unknown): CustomShaderSpec {
  if (!isCustomShaderRecord(value)) return cloneDefaultCustomShaderSpec();
  const palette = normalizeCustomShaderPalette(value.palette);
  const operations = Array.isArray(value.operations)
    ? value.operations
        .map(normalizeCustomShaderOperation)
        .filter((operation): operation is CustomShaderOperation => Boolean(operation))
    : [];
  return {
    version: 2,
    label: typeof value.label === 'string' ? value.label.slice(0, 80) : DEFAULT_CUSTOM_SHADER_SPEC.label,
    prompt: typeof value.prompt === 'string' ? value.prompt.slice(0, AI_SHADER_PROMPT_MAX_LENGTH) : undefined,
    base: clampCustomShaderNumber(value.base, 0, 1, DEFAULT_CUSTOM_SHADER_SPEC.base ?? 0.46),
    contrast: clampCustomShaderNumber(value.contrast, 0.1, 4, DEFAULT_CUSTOM_SHADER_SPEC.contrast ?? 1.18),
    palette: palette.length > 0 ? palette : [...(DEFAULT_CUSTOM_SHADER_SPEC.palette ?? [])],
    provenance: normalizeCustomShaderProvenance(value.provenance),
    operations: operations.length > 0 ? operations.slice(0, 12) : cloneDefaultCustomShaderSpec().operations,
  };
}

export function validateCustomShaderSpec(value: unknown): string[] {
  const errors: string[] = [];
  if (!isCustomShaderRecord(value)) return ['Shader spec must be an object.'];
  if (value.version !== 2) errors.push('Shader spec version must be 2.');
  const palette = normalizeCustomShaderPalette(value.palette);
  if (palette.length === 0) errors.push('Palette needs at least one hex color.');
  if (!Array.isArray(value.operations) || value.operations.length === 0)
    errors.push('Add at least one shader operation.');
  if (Array.isArray(value.operations) && value.operations.length > 12) errors.push('Use 12 operations or fewer.');
  if (Array.isArray(value.operations)) {
    value.operations.forEach((operation, index) => {
      if (!normalizeCustomShaderOperation(operation))
        errors.push(`Operation ${index + 1} is not supported or has invalid values.`);
    });
  }
  return errors;
}

function normalizeCustomShaderOperation(value: unknown): CustomShaderOperation | null {
  if (!isCustomShaderRecord(value)) return null;
  switch (value.op) {
    case 'noise':
      return {
        op: 'noise',
        scale: clampCustomShaderNumber(value.scale, 0.1, 40, 3),
        amount: clampCustomShaderNumber(value.amount, -2, 2, 0.3),
        octaves: Math.round(clampCustomShaderNumber(value.octaves, 1, 7, 4)),
        seedOffset: Math.round(clampCustomShaderNumber(value.seedOffset, 0, 9999, 0)),
      };
    case 'wave':
      return {
        op: 'wave',
        frequency: clampCustomShaderNumber(value.frequency, 0.1, 80, 8),
        amplitude: clampCustomShaderNumber(value.amplitude, -2, 2, 0.2),
        angle: clampCustomShaderNumber(value.angle, -360, 360, 0),
        phase: clampCustomShaderNumber(value.phase, -Math.PI * 8, Math.PI * 8, 0),
      };
    case 'rings':
      return {
        op: 'rings',
        frequency: clampCustomShaderNumber(value.frequency, 0.1, 80, 12),
        amount: clampCustomShaderNumber(value.amount, -2, 2, 0.24),
        centerX: clampCustomShaderNumber(value.centerX, -1, 1, 0),
        centerY: clampCustomShaderNumber(value.centerY, -1, 1, 0),
      };
    case 'swirl':
      return {
        op: 'swirl',
        amount: clampCustomShaderNumber(value.amount, -2, 2, 0.2),
        radius: clampCustomShaderNumber(value.radius, 0.05, 4, 1.1),
      };
    case 'threshold':
      return {
        op: 'threshold',
        value: clampCustomShaderNumber(value.value, 0, 1, 0.5),
        softness: clampCustomShaderNumber(value.softness, 0, 1, 0.08),
      };
    case 'posterize':
      return {
        op: 'posterize',
        steps: Math.round(clampCustomShaderNumber(value.steps, 2, 16, 4)),
      };
    case 'invert':
      return {
        op: 'invert',
        amount: clampCustomShaderNumber(value.amount, 0, 1, 1),
      };
    case 'sourceLuma':
      return {
        op: 'sourceLuma',
        amount: clampCustomShaderNumber(value.amount, 0, 1, 0.45),
      };
    case 'edgeGlow':
      return {
        op: 'edgeGlow',
        amount: clampCustomShaderNumber(value.amount, 0, 2, 0.35),
        softness: clampCustomShaderNumber(value.softness, 0, 1, 0.18),
      };
    case 'chromaticShift':
      return {
        op: 'chromaticShift',
        amount: clampCustomShaderNumber(value.amount, 0, 1, 0.24),
        angle: clampCustomShaderNumber(value.angle, -360, 360, 0),
      };
    case 'gradientMap':
      return {
        op: 'gradientMap',
        amount: clampCustomShaderNumber(value.amount, 0, 1, 0.65),
      };
    default:
      return null;
  }
}

function normalizeCustomShaderPalette(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((color): color is string => typeof color === 'string' && CUSTOM_SHADER_HEX_COLOR_RE.test(color))
    .slice(0, 8);
}

function normalizeCustomShaderProvenance(value: unknown): CustomShaderProvenance | undefined {
  if (!isCustomShaderRecord(value)) return undefined;
  if (!AI_SHADER_SPEC_SOURCES.includes(value.source as AiShaderSpecSource)) return undefined;
  const model = typeof value.model === 'string' && value.model.trim() ? value.model.slice(0, 80) : undefined;
  return {
    source: value.source as AiShaderSpecSource,
    ...(model ? { model } : {}),
  };
}

function clampCustomShaderNumber(value: unknown, min: number, max: number, fallback: number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function isCustomShaderRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface AiGeneratedAssetMetadata {
  provider: AiGenerationProvider;
  model: string;
  prompt: string;
  negativePrompt?: string;
  settings: AiGenerationSettings;
  seed?: string | number;
  sourceAssetIds?: string[];
  licenseNote?: string;
  createdAt: string;
}

export interface AiGenerationAsset {
  id: string;
  uri: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
  createdAt: string;
  metadata: AiGeneratedAssetMetadata;
}

export interface AiGenerationQuotaSnapshot {
  period: string;
  limit: number;
  used: number;
  remaining: number;
}

export interface AiGenerationJobError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface AiGenerationJob {
  id: string;
  status: AiGenerationJobStatus;
  provider: AiGenerationProvider;
  model: string;
  prompt: string;
  settings: AiGenerationSettings;
  asset?: AiGenerationAsset;
  quota?: AiGenerationQuotaSnapshot;
  error?: AiGenerationJobError;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface AiGenerationAccessState {
  authenticated: boolean;
  enabled: boolean;
  disabledReason?: 'anonymous' | 'invalid_session' | 'not_enabled' | 'quota_exhausted' | 'maintenance';
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
  quota?: AiGenerationQuotaSnapshot;
  providers?: AiGenerationProvider[];
}

export interface AiErrorResponse {
  code: string;
  message: string;
}

export interface ApiHealthResponse {
  ok: true;
  service: 'artifact-api';
  databaseDriver: 'memory' | 'postgres';
  queueDriver: 'memory' | 'bullmq';
  storageDriver: 'local' | 's3';
  providers: AiGenerationProvider[];
  bullBoardEnabled: boolean;
}

export interface GenerationQueuePayload {
  jobId: string;
  userId: string;
}

export type AiProvider = AiGenerationProvider;
export type AiJobStatus = AiGenerationJobStatus;
export type AiQuotaSnapshot = AiGenerationQuotaSnapshot;
export type CreateGenerationRequest = CreateAiGenerationRequest;
export type AiGenerationAssetResponse = AiGenerationAsset;
export type AiGenerationJobResponse = AiGenerationJob;
export type AiAccessResponse = AiGenerationAccessState;

export const AI_PROVIDERS = AI_GENERATION_PROVIDERS;
export const AI_JOB_STATUSES = AI_GENERATION_JOB_STATUSES;

export function isAiGenerationProvider(value: unknown): value is AiGenerationProvider {
  return typeof value === 'string' && AI_GENERATION_PROVIDERS.includes(value as AiGenerationProvider);
}

export function isAiGenerationJobStatus(value: unknown): value is AiGenerationJobStatus {
  return typeof value === 'string' && AI_GENERATION_JOB_STATUSES.includes(value as AiGenerationJobStatus);
}
