import { type CustomShaderSpec, normalizeCustomShaderSpec } from '../contracts.js';

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
}

export interface ShaderSpecGenerationProvider {
  readonly provider: 'openai' | 'local';
  readonly defaultModel: string;
  generateShaderSpec(request: ShaderSpecGenerationRequest): Promise<CustomShaderSpec>;
}

export interface OpenAiShaderSpecProviderOptions {
  apiKey: string;
  defaultModel?: string;
  endpoint?: string;
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
}

export function createOpenAiShaderSpecProvider(options: OpenAiShaderSpecProviderOptions): ShaderSpecGenerationProvider {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/responses';
  const fetcher = options.fetch ?? fetch;

  return {
    provider: 'openai',
    defaultModel: options.defaultModel ?? 'gpt-5.5',
    async generateShaderSpec(request) {
      const model = options.defaultModel ?? 'gpt-5.5';
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
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
      return normalizeCustomShaderSpec(readOpenAiShaderSpec(body, request.prompt));
    },
  };
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

const numericParamSchema = { type: 'number' };

const CUSTOM_SHADER_SPEC_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['version', 'label', 'prompt', 'base', 'contrast', 'palette', 'operations'],
  properties: {
    version: { type: 'number', enum: [1] },
    label: { type: 'string', maxLength: 80 },
    prompt: { type: 'string', maxLength: 500 },
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
        type: 'object',
        additionalProperties: false,
        required: [
          'op',
          'scale',
          'amount',
          'octaves',
          'seedOffset',
          'frequency',
          'amplitude',
          'angle',
          'phase',
          'centerX',
          'centerY',
          'radius',
          'value',
          'softness',
          'steps',
        ],
        properties: {
          op: {
            type: 'string',
            enum: [
              'noise',
              'wave',
              'rings',
              'swirl',
              'threshold',
              'posterize',
              'invert',
              'sourceLuma',
              'edgeGlow',
              'chromaticShift',
              'gradientMap',
            ],
          },
          scale: numericParamSchema,
          amount: numericParamSchema,
          octaves: numericParamSchema,
          seedOffset: numericParamSchema,
          frequency: numericParamSchema,
          amplitude: numericParamSchema,
          angle: numericParamSchema,
          phase: numericParamSchema,
          centerX: numericParamSchema,
          centerY: numericParamSchema,
          radius: numericParamSchema,
          value: numericParamSchema,
          softness: numericParamSchema,
          steps: numericParamSchema,
        },
      },
    },
  },
} as const;
