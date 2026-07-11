import {
  type ShaderDefinition,
  type ShaderInstance,
  type ShaderPropertyDefinition,
  stripShaderCodeComments,
  validateShaderCode,
  validateShaderDefinition,
} from '../contracts.js';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}

export interface ShaderGenerationRequest {
  prompt: string;
  clientRequestId: string;
  repair?: {
    instance: ShaderInstance;
    diagnostic: { stage: string; message: string; browser?: string };
  };
  refine?: {
    instance: ShaderInstance;
    instruction: string;
  };
}

export interface ShaderGenerationResult {
  instance: ShaderInstance;
  requestId?: string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

export interface ShaderGenerationProvider {
  readonly provider: 'openai' | 'local';
  readonly defaultModel: string;
  generateShader(request: ShaderGenerationRequest): Promise<ShaderGenerationResult>;
}

export interface OpenAiShaderProviderOptions {
  apiKey: string;
  defaultModel?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: (url: string, init: RequestInit) => Promise<FetchResponseLike>;
}

interface OpenAiResponsesApiBody {
  output_text?: unknown;
  output?: Array<{ content?: Array<{ text?: unknown }> }>;
  error?: { message?: unknown };
  usage?: { input_tokens?: unknown; output_tokens?: unknown; total_tokens?: unknown };
}

interface GeneratedShaderPayload {
  label: string;
  code: string;
  properties: ShaderPropertyDefinition[];
}

export class OpenAiShaderTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`OpenAI shader generation timed out after ${timeoutMs} ms.`);
    this.name = 'OpenAiShaderTimeoutError';
  }
}

export function isOpenAiShaderTimeoutError(error: unknown): error is OpenAiShaderTimeoutError {
  return error instanceof OpenAiShaderTimeoutError;
}

export function createOpenAiShaderProvider(options: OpenAiShaderProviderOptions): ShaderGenerationProvider {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    provider: 'openai',
    defaultModel: options.defaultModel ?? 'gpt-5.5',
    async generateShader(request) {
      const model = options.defaultModel ?? 'gpt-5.5';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetcher(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
            'x-client-request-id': request.clientRequestId,
          },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            max_output_tokens: 2_400,
            reasoning: { effort: 'low' },
            input: request.repair
              ? [
                  { role: 'system', content: SHADER_REPAIR_SYSTEM_PROMPT },
                  { role: 'user', content: repairPrompt(request) },
                ]
              : request.refine
                ? [
                    { role: 'system', content: SHADER_REFINE_SYSTEM_PROMPT },
                    { role: 'user', content: refinementPrompt(request) },
                  ]
                : [
                    { role: 'system', content: SHADER_SYSTEM_PROMPT },
                    { role: 'user', content: request.prompt },
                  ],
            text: {
              format: {
                type: 'json_schema',
                name: 'artifact_shader_definition',
                strict: true,
                schema: GENERATED_SHADER_JSON_SCHEMA,
              },
            },
          }),
        });
        const body = (await response.json()) as OpenAiResponsesApiBody;
        assertResponseOk(response, body);
        const generated = readGeneratedShader(body);
        const definition: ShaderDefinition = {
          version: 1,
          id: `${request.clientRequestId}-definition`,
          label: generated.label,
          language: 'glsl-fragment',
          code: generated.code,
          properties: generated.properties,
        };
        const validationErrors = [...validateShaderDefinition(definition), ...validateShaderCode(definition.code)];
        if (!/\btexture2D\s*\(\s*u_backdrop\b/.test(stripShaderCodeComments(definition.code))) {
          validationErrors.push('AI shader effects must sample the connected u_backdrop image.');
        }
        if (validationErrors.length > 0) {
          const messages = validationErrors.map((error) => (typeof error === 'string' ? error : error.message));
          throw new Error(`OpenAI shader did not match the contract: ${messages.join(' ')}`);
        }
        return {
          instance: {
            definition,
            values: Object.fromEntries(definition.properties.map((property) => [property.key, property.default])),
          },
          requestId: response.headers.get('x-request-id') ?? undefined,
          usage: readUsage(body),
        };
      } catch (error) {
        if (controller.signal.aborted) throw new OpenAiShaderTimeoutError(timeoutMs);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

const SHADER_SYSTEM_PROMPT = `Create one editable GLSL ES 1.00 fragment shader effect for Artifact.
The shader processes a connected image through texture2D(u_backdrop, uv) and must keep the source recognizable unless the user explicitly asks for a destructive treatment.
Return code that defines vec4 mainImage(vec2 uv). Do not declare uniforms, write void main(), use gl_FragColor, preprocessor directives, while loops, or do loops.
At most one loop is allowed. It must use the exact form for (int i = 0; i < N; i++) with N <= 32.
Available built-in uniforms: sampler2D u_backdrop, vec2 u_resolution, float u_seed, float u_strength, float u_has_backdrop.
Every editable property must be listed in properties and read in code as u_prop_<key>. Number and boolean properties are float uniforms; colors are vec3 uniforms.
Choose zero to 8 useful properties based on the effect. Add as many color controls as the effect genuinely needs and none when it does not need editable colors. Do not emit unused properties, animation uniforms, JavaScript, HTML, WGSL, markdown, or commentary.`;

const SHADER_REPAIR_SYSTEM_PROMPT = `${SHADER_SYSTEM_PROMPT}
Repair the supplied shader so it passes the reported browser validation failure. Preserve the original visual intent and useful editable controls. Return the complete corrected definition, never a patch or explanation.`;

const SHADER_REFINE_SYSTEM_PROMPT = `${SHADER_SYSTEM_PROMPT}
Refine the supplied accepted shader according to the user's instruction. Preserve parts the user did not ask to change, keep the connected source recognizable, and return the complete updated definition. Keep only controls that remain useful and visibly affect the result. Never return a patch or explanation.`;

function repairPrompt(request: ShaderGenerationRequest) {
  if (!request.repair) return request.prompt;
  return JSON.stringify({
    originalPrompt: request.prompt,
    failedDefinition: request.repair.instance.definition,
    compilerDiagnostic: request.repair.diagnostic,
  });
}

function refinementPrompt(request: ShaderGenerationRequest) {
  if (!request.refine) return request.prompt;
  return JSON.stringify({
    instruction: request.refine.instruction,
    acceptedDefinition: request.refine.instance.definition,
    currentValues: request.refine.instance.values,
  });
}

function readGeneratedShader(body: OpenAiResponsesApiBody): GeneratedShaderPayload {
  const outputText = readOutputText(body);
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error('OpenAI shader response was not valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenAI shader response did not include a shader definition.');
  }
  const value = parsed as Record<string, unknown>;
  return {
    label: typeof value.label === 'string' ? value.label : '',
    code: typeof value.code === 'string' ? value.code : '',
    properties: Array.isArray(value.properties) ? (value.properties as ShaderPropertyDefinition[]) : [],
  };
}

function readOutputText(body: OpenAiResponsesApiBody) {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  throw new Error('OpenAI shader response did not include output text.');
}

function assertResponseOk(response: FetchResponseLike, body: OpenAiResponsesApiBody) {
  if (response.ok) return;
  const message = body.error?.message;
  throw new Error(
    typeof message === 'string' && message ? message : `OpenAI shader generation failed with HTTP ${response.status}.`,
  );
}

function readUsage(body: OpenAiResponsesApiBody): ShaderGenerationResult['usage'] {
  const inputTokens = finiteNumber(body.usage?.input_tokens);
  const outputTokens = finiteNumber(body.usage?.output_tokens);
  const totalTokens = finiteNumber(body.usage?.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

const numberPropertySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label', 'type', 'default', 'min', 'max', 'step'],
  properties: {
    key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' },
    label: { type: 'string', minLength: 1, maxLength: 60 },
    type: { type: 'string', enum: ['number'] },
    default: { type: 'number' },
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number', exclusiveMinimum: 0 },
  },
} as const;

const booleanPropertySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label', 'type', 'default'],
  properties: {
    key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' },
    label: { type: 'string', minLength: 1, maxLength: 60 },
    type: { type: 'string', enum: ['boolean'] },
    default: { type: 'boolean' },
  },
} as const;

const colorPropertySchema = {
  type: 'object',
  additionalProperties: false,
  required: ['key', 'label', 'type', 'default'],
  properties: {
    key: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_]{0,39}$' },
    label: { type: 'string', minLength: 1, maxLength: 60 },
    type: { type: 'string', enum: ['color'] },
    default: { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' },
  },
} as const;

const GENERATED_SHADER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['label', 'code', 'properties'],
  properties: {
    label: { type: 'string', minLength: 1, maxLength: 80 },
    code: { type: 'string', minLength: 1, maxLength: 12_000 },
    properties: {
      type: 'array',
      maxItems: 8,
      items: { anyOf: [numberPropertySchema, booleanPropertySchema, colorPropertySchema] },
    },
  },
} as const;
