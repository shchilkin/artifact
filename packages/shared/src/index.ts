export const AI_API_PATHS = {
  health: '/api/health',
  access: '/api/ai/access',
  shader: '/api/ai/shaders',
  shaderValidation: (id: string) => `/api/ai/shaders/${encodeURIComponent(id)}/validation`,
  shaderRepair: (id: string) => `/api/ai/shaders/${encodeURIComponent(id)}/repair`,
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
  requestId?: string;
  attempt?: 'initial' | 'repair' | 'localFallback';
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

export const AI_SHADER_SOURCES = ['openai', 'localFallback'] as const;
export type AiShaderSource = (typeof AI_SHADER_SOURCES)[number];

export const AI_SHADER_REQUEST_MODES = ['openai', 'localFallback'] as const;
export type AiShaderRequestMode = (typeof AI_SHADER_REQUEST_MODES)[number];
export const AI_SHADER_PROMPT_MAX_LENGTH = 500;
export const AI_SHADER_DIAGNOSTIC_MAX_LENGTH = 1_200;

export const AI_SHADER_LIFECYCLE_STATUSES = [
  'generated',
  'client_rejected',
  'repairing',
  'accepted',
  'failed',
] as const;
export type AiShaderLifecycleStatus = (typeof AI_SHADER_LIFECYCLE_STATUSES)[number];

export const AI_SHADER_VALIDATION_STAGES = ['compile', 'link', 'runtime-contract', 'render'] as const;
export type AiShaderValidationStage = (typeof AI_SHADER_VALIDATION_STAGES)[number];

export interface AiShaderCompilerDiagnostic {
  stage: AiShaderValidationStage;
  message: string;
  browser?: string;
}

export interface CreateAiShaderRequest {
  prompt: string;
  mode?: AiShaderRequestMode;
  idempotencyKey: string;
  fallbackForIdempotencyKey?: string;
}

export interface AiShaderGenerationResponse {
  requestId: string;
  candidateRevision: 0 | 1;
  status: 'generated' | 'accepted';
  attempt: 'initial' | 'repair' | 'localFallback';
  prompt: string;
  instance: ShaderInstance;
  source: AiShaderSource;
  model?: string;
  warnings?: string[];
}

export interface ValidateAiShaderRequest {
  candidateRevision: 0 | 1;
  outcome: 'accepted' | 'rejected';
  diagnostic?: AiShaderCompilerDiagnostic;
}

export interface AiShaderValidationResponse {
  requestId: string;
  candidateRevision: 0 | 1;
  status: 'accepted' | 'client_rejected' | 'failed';
  repairAvailable: boolean;
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
  const executableCode = typeof value.code === 'string' ? stripShaderCodeComments(value.code) : '';
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
    if (!new RegExp(`\\bu_prop_${normalized.key}\\b`).test(executableCode)) {
      errors.push(`Shader property ${normalized.key} is not used by the shader code.`);
    }
  });
  return errors;
}

export function validateShaderInstance(value: unknown): string[] {
  if (!isCustomShaderRecord(value)) return ['Shader instance must be an object.'];
  const errors = validateShaderDefinition(value.definition);
  if (errors.length > 0) return errors;
  const definition = value.definition as unknown as ShaderDefinition;
  const values = isCustomShaderRecord(value.values) ? value.values : {};
  for (const property of definition.properties) {
    const candidate = values[property.key];
    if (candidate === undefined) continue;
    if (property.type === 'number' && (typeof candidate !== 'number' || !Number.isFinite(candidate))) {
      errors.push(`Shader property value ${property.key} must be a finite number.`);
    }
    if (property.type === 'boolean' && typeof candidate !== 'boolean') {
      errors.push(`Shader property value ${property.key} must be true or false.`);
    }
    if (property.type === 'color' && (typeof candidate !== 'string' || !CUSTOM_SHADER_HEX_COLOR_RE.test(candidate))) {
      errors.push(`Shader property value ${property.key} must be a hex color.`);
    }
  }
  return errors;
}

export interface ShaderCodeIssue {
  severity: 'error';
  message: string;
}

const MAX_SHADER_CODE_LENGTH = 12_000;
const MAX_SHADER_LOOP_COUNT = 32;
const MAX_SHADER_LOOP_STATEMENTS = 1;

export function validateShaderCode(code: string): ShaderCodeIssue[] {
  const issues: ShaderCodeIssue[] = [];
  if (!code.trim()) return [{ severity: 'error', message: 'Add code for mainImage(uv).' }];
  const executableCode = stripShaderCodeComments(code);
  if (code.length > MAX_SHADER_CODE_LENGTH) {
    issues.push({ severity: 'error', message: 'Keep shader code under 12,000 characters.' });
  }
  if (!/\bvec4\s+mainImage\s*\(\s*vec2\s+\w+\s*\)/.test(executableCode)) {
    issues.push({ severity: 'error', message: 'Add vec4 mainImage(vec2 uv) so the shader knows what to draw.' });
  }
  if (/\bvoid\s+main\s*\(/.test(executableCode)) {
    issues.push({ severity: 'error', message: 'Remove void main(). Artifact adds the final wrapper for you.' });
  }
  if (/\bgl_Frag(Color|Data)\b/.test(executableCode)) {
    issues.push({ severity: 'error', message: 'Return a vec4 from mainImage instead of writing gl_FragColor.' });
  }
  if (/^\s*#/m.test(executableCode)) {
    issues.push({ severity: 'error', message: 'Remove preprocessor lines that start with #.' });
  }
  if (/\b(while|do)\b/.test(executableCode)) {
    issues.push({ severity: 'error', message: 'Use small fixed for-loops. while and do loops are blocked.' });
  }
  collectShaderLoopIssues(executableCode).forEach((message) => issues.push({ severity: 'error', message }));
  return issues;
}

export function stripShaderCodeComments(code: string) {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function collectShaderLoopIssues(code: string) {
  const issues: string[] = [];
  const loops = [...code.matchAll(/\bfor\s*\(([^;]*);([^;]*);([^)]*)\)/g)];
  if (loops.length > MAX_SHADER_LOOP_STATEMENTS) issues.push('Use at most one small fixed for-loop in a shader.');
  for (const match of loops) {
    const initializer = (match[1] ?? '').trim();
    const condition = (match[2] ?? '').trim();
    const increment = (match[3] ?? '').trim();
    const initializerMatch = initializer.match(/^int\s+([A-Za-z_]\w*)\s*=\s*0$/);
    if (!initializerMatch) {
      issues.push('Start fixed loops at zero, for example for (int i = 0; i < 12; i++).');
      continue;
    }
    const variable = initializerMatch[1];
    const conditionMatch = condition.match(new RegExp(`^${variable}\\s*<\\s*(\\d+)$`));
    if (!conditionMatch) {
      issues.push('Use a fixed numeric loop limit with the same counter, for example i < 12.');
      continue;
    }
    const escapedVariable = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (
      !new RegExp(
        `^(?:${escapedVariable}\\+\\+|\\+\\+${escapedVariable}|${escapedVariable}\\s*\\+=\\s*[1-9]\\d*)$`,
      ).test(increment)
    ) {
      issues.push('Advance the loop counter with i++, ++i, or i += a positive number.');
    }
    if (Number(conditionMatch[1]) > MAX_SHADER_LOOP_COUNT) {
      issues.push(`Keep for-loops at ${MAX_SHADER_LOOP_COUNT} steps or fewer.`);
    }
  }
  return issues;
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
    requestId: typeof value.requestId === 'string' ? value.requestId.slice(0, 200) : undefined,
    attempt:
      value.attempt === 'initial' || value.attempt === 'repair' || value.attempt === 'localFallback'
        ? value.attempt
        : undefined,
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
