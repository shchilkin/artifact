import type { AiGenerationSettings } from '../contracts.js';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './index.js';

interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: {
    get(name: string): string | null;
  };
  json(): Promise<unknown>;
}

export interface OpenAiImageProviderOptions {
  apiKey: string;
  defaultModel?: string;
  endpoint?: string;
  fetch?: (url: string, init: RequestInit) => Promise<FetchResponseLike>;
}

interface OpenAiImageResponse {
  data?: Array<{
    b64_json?: unknown;
    revised_prompt?: unknown;
  }>;
  usage?: unknown;
  error?: {
    message?: unknown;
    code?: unknown;
    type?: unknown;
  };
}

export function createOpenAiImageProvider(options: OpenAiImageProviderOptions): ImageGenerationProvider {
  const endpoint = options.endpoint ?? 'https://api.openai.com/v1/images/generations';
  const fetcher = options.fetch ?? fetch;

  return {
    provider: 'openai',
    defaultModel: options.defaultModel ?? 'gpt-image-2',
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
      const model = request.model || options.defaultModel || 'gpt-image-2';
      const size = sizeForAspect(request.settings.aspect);
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: request.prompt,
          n: 1,
          size,
          quality: qualityForSetting(request.settings.quality),
          output_format: 'png',
        }),
      });
      const body = (await response.json()) as OpenAiImageResponse;
      assertOpenAiResponseOk(response, body);
      const dimensions = dimensionsForSize(size);
      return {
        provider: 'openai',
        model,
        mimeType: 'image/png',
        bytes: openAiImageBytes(body),
        width: dimensions.width,
        height: dimensions.height,
        usage: {
          metadata: {
            requestId: response.headers.get('x-request-id'),
            revisedPrompt: body.data?.[0]?.revised_prompt,
            usage: body.usage,
          },
        },
        raw: {
          requestId: response.headers.get('x-request-id'),
        },
      };
    },
  };
}

function assertOpenAiResponseOk(response: FetchResponseLike, body: OpenAiImageResponse) {
  if (!response.ok) throw new Error(readOpenAiError(body, response.status));
}

function openAiImageBytes(body: OpenAiImageResponse) {
  const encoded = body.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('OpenAI image response did not include image data.');
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0) throw new Error('OpenAI image response decoded to an empty file.');
  return bytes;
}

function sizeForAspect(aspect: AiGenerationSettings['aspect']) {
  switch (aspect) {
    case '4:5':
      return '1024x1280';
    case '9:16':
      return '1024x1792';
    case '16:9':
      return '1792x1024';
    case '1:1':
      return '1024x1024';
  }
}

function dimensionsForSize(size: string) {
  const [width, height] = size.split('x').map(Number);
  return { width, height };
}

function qualityForSetting(quality: AiGenerationSettings['quality']) {
  if (quality === 'draft') return 'low';
  if (quality === 'high') return 'high';
  return 'medium';
}

function readOpenAiError(body: OpenAiImageResponse, status: number) {
  const message = body.error?.message;
  return typeof message === 'string' && message ? message : `OpenAI image generation failed with HTTP ${status}.`;
}
