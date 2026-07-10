import {
  AI_SHADER_PROMPT_MAX_LENGTH,
  type CustomShaderSpec,
  normalizeCustomShaderSpec,
  validateCustomShaderSpec,
} from '../contracts.js';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
}

export interface ShaderSpecGenerationRequest {
  prompt: string;
  clientRequestId: string;
}

export interface ShaderSpecGenerationResult {
  spec: CustomShaderSpec;
  requestId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface ShaderSpecGenerationProvider {
  readonly provider: 'openai' | 'local';
  readonly defaultModel: string;
  generateShaderSpec(request: ShaderSpecGenerationRequest): Promise<ShaderSpecGenerationResult>;
}

export interface OpenAiShaderSpecProviderOptions {
  apiKey: string;
  defaultModel?: string;
  endpoint?: string;
  timeoutMs?: number;
  fetch?: (url: string, init: RequestInit) => Promise<FetchResponseLike>;
}

interface OpenAiResponsesApiBody {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
    }>;
  }>;
  error?: {
    message?: unknown;
  };
  usage?: {
    input_tokens?: unknown;
    output_tokens?: unknown;
    total_tokens?: unknown;
  };
}

export class OpenAiShaderSpecTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`OpenAI shader generation timed out after ${timeoutMs} ms.`);
    this.name = 'OpenAiShaderSpecTimeoutError';
  }
}

export function isOpenAiShaderSpecTimeoutError(error: unknown): error is OpenAiShaderSpecTimeoutError {
  return error instanceof OpenAiShaderSpecTimeoutError;
}

export function createOpenAiShaderSpecProvider(options: OpenAiShaderSpecProviderOptions): ShaderSpecGenerationProvider {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
  const fetcher = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 20_000;

  return {
    provider: 'openai',
    defaultModel: options.defaultModel ?? 'gpt-5.5',
    async generateShaderSpec(request) {
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
            input: [
              {
                role: 'system',
                content:
                  'Create a deterministic editable shader pass spec for Artifact. The spec processes a connected source image/backdrop. Prefer source-aware operations such as sourceLuma, edgeGlow, chromaticShift, and gradientMap when the prompt asks for photo processing, glass, water, print, glow, or tone mapping. Return only structured JSON matching the provided schema. Do not include GLSL, WGSL, JavaScript, HTML, or executable code.',
              },
              {
                role: 'user',
                content: request.prompt,
              },
            ],
            text: {
              format: {
                type: 'json_schema',
                name: 'artifact_custom_shader_spec',
                strict: true,
                schema: CUSTOM_SHADER_SPEC_JSON_SCHEMA,
              },
            },
          }),
        });
        const body = (await response.json()) as OpenAiResponsesApiBody;
        assertOpenAiShaderSpecResponseOk(response, body);
        const rawSpec = readOpenAiShaderSpec(body, request.prompt);
        const validationErrors = validateCustomShaderSpec(rawSpec);
        if (validationErrors.length > 0) {
          throw new Error(`OpenAI shader spec did not match the contract: ${validationErrors.join(' ')}`);
        }
        return {
          spec: normalizeCustomShaderSpec(rawSpec),
          requestId: response.headers.get('x-request-id') ?? undefined,
          usage: readOpenAiUsage(body),
        };
      } catch (error) {
        if (controller.signal.aborted) throw new OpenAiShaderSpecTimeoutError(timeoutMs);
        throw error;
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function readOpenAiUsage(body: OpenAiResponsesApiBody): ShaderSpecGenerationResult['usage'] {
  const inputTokens = finiteNumber(body.usage?.input_tokens);
  const outputTokens = finiteNumber(body.usage?.output_tokens);
  const totalTokens = finiteNumber(body.usage?.total_tokens);
  if (inputTokens === undefined && outputTokens === undefined && totalTokens === undefined) return undefined;
  return { inputTokens, outputTokens, totalTokens };
}

function finiteNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function assertOpenAiShaderSpecResponseOk(response: FetchResponseLike, body: OpenAiResponsesApiBody) {
  if (!response.ok) throw new Error(readOpenAiShaderSpecError(body, response.status));
}

function readOpenAiShaderSpec(body: OpenAiResponsesApiBody, prompt: string) {
  const outputText = readOpenAiOutputText(body);
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    throw new Error('OpenAI shader spec response was not valid JSON.');
  }
  return typeof parsed === 'object' && parsed !== null ? { ...parsed, prompt } : parsed;
}

function readOpenAiOutputText(body: OpenAiResponsesApiBody) {
  if (typeof body.output_text === 'string' && body.output_text.trim()) return body.output_text;
  for (const output of body.output ?? []) {
    for (const content of output.content ?? []) {
      if (typeof content.text === 'string' && content.text.trim()) return content.text;
    }
  }
  throw new Error('OpenAI shader spec response did not include output text.');
}

function readOpenAiShaderSpecError(body: OpenAiResponsesApiBody, status: number) {
  const message = body.error?.message;
  return typeof message === 'string' && message ? message : `OpenAI shader spec generation failed with HTTP ${status}.`;
}

const numericParamSchema = { type: 'number' } as const;

function operationSchema(op: string, properties: Record<string, typeof numericParamSchema>) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['op', ...Object.keys(properties)],
    properties: {
      op: { type: 'string', enum: [op] },
      ...properties,
    },
  } as const;
}

const CUSTOM_SHADER_SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'label', 'prompt', 'base', 'contrast', 'palette', 'operations'],
  properties: {
    version: { type: 'number', enum: [2] },
    label: { type: 'string', maxLength: 80 },
    prompt: { type: 'string', maxLength: AI_SHADER_PROMPT_MAX_LENGTH },
    base: { type: 'number', minimum: 0, maximum: 1 },
    contrast: { type: 'number', minimum: 0.1, maximum: 4 },
    palette: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: { type: 'string', pattern: '^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$' },
    },
    operations: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        anyOf: [
          operationSchema('noise', {
            scale: numericParamSchema,
            amount: numericParamSchema,
            octaves: numericParamSchema,
            seedOffset: numericParamSchema,
          }),
          operationSchema('wave', {
            frequency: numericParamSchema,
            amplitude: numericParamSchema,
            angle: numericParamSchema,
            phase: numericParamSchema,
          }),
          operationSchema('rings', {
            frequency: numericParamSchema,
            amount: numericParamSchema,
            centerX: numericParamSchema,
            centerY: numericParamSchema,
          }),
          operationSchema('swirl', { amount: numericParamSchema, radius: numericParamSchema }),
          operationSchema('threshold', { value: numericParamSchema, softness: numericParamSchema }),
          operationSchema('posterize', { steps: numericParamSchema }),
          operationSchema('invert', { amount: numericParamSchema }),
          operationSchema('sourceLuma', { amount: numericParamSchema }),
          operationSchema('edgeGlow', { amount: numericParamSchema, softness: numericParamSchema }),
          operationSchema('chromaticShift', { amount: numericParamSchema, angle: numericParamSchema }),
          operationSchema('gradientMap', { amount: numericParamSchema }),
        ],
      },
    },
  },
} as const;
