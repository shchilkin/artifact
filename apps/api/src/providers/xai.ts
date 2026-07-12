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

export interface XAiImageProviderOptions {
  apiKey: string;
  defaultModel?: string;
  endpoint?: string;
  fetch?: (url: string, init: RequestInit) => Promise<FetchResponseLike>;
}

interface XAiImageResponse {
  data?: Array<{
    b64_json?: unknown;
    mime_type?: unknown;
    revised_prompt?: unknown;
  }>;
  usage?: { cost_in_usd_ticks?: unknown };
  error?: {
    message?: unknown;
    code?: unknown;
    type?: unknown;
  };
}

export function createXAiImageProvider(options: XAiImageProviderOptions): ImageGenerationProvider {
  const endpoint = options.endpoint ?? 'https://api.x.ai/v1/images/generations';
  const fetcher = options.fetch ?? fetch;

  return {
    provider: 'xai',
    defaultModel: options.defaultModel ?? 'grok-imagine-image-quality',
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
      const aspectRatio = aspectRatioForSetting(request.settings.aspect);
      const resolution = resolutionForQuality(request.settings.quality);
      const model = request.model || options.defaultModel || 'grok-imagine-image-quality';
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
          aspect_ratio: aspectRatio,
          resolution,
          response_format: 'b64_json',
        }),
      });
      const body = (await response.json()) as XAiImageResponse;
      assertXAiResponseOk(response, body);
      const dimensions = dimensionsForAspect(aspectRatio, resolution);
      return {
        provider: 'xai',
        model,
        mimeType: mimeType(body.data?.[0]?.mime_type),
        bytes: xAiImageBytes(body),
        width: dimensions.width,
        height: dimensions.height,
        usage: {
          providerRequestId: response.headers.get('x-request-id') ?? undefined,
          metrics: {
            imageCount: 1,
            imageSize: resolution,
            imageQuality: request.settings.quality,
            costUsdTicks: integerString(body.usage?.cost_in_usd_ticks),
          },
          metadata: {
            requestId: response.headers.get('x-request-id'),
            revisedPrompt: body.data?.[0]?.revised_prompt,
            usage: body.usage,
            aspectRatio,
            resolution,
            requestedAspect: request.settings.aspect,
          },
        },
        raw: {
          requestId: response.headers.get('x-request-id'),
        },
      };
    },
  };
}

function integerString(value: unknown) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === 'string' && /^\d+$/.test(value)) return value;
  return undefined;
}

function assertXAiResponseOk(response: FetchResponseLike, body: XAiImageResponse) {
  if (!response.ok) throw new Error(readXAiError(body, response.status));
}

function xAiImageBytes(body: XAiImageResponse) {
  const encoded = body.data?.[0]?.b64_json;
  if (typeof encoded !== 'string' || encoded.length === 0) {
    throw new Error('xAI image response did not include image data.');
  }

  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.byteLength === 0) throw new Error('xAI image response decoded to an empty file.');
  return bytes;
}

function aspectRatioForSetting(aspect: AiGenerationSettings['aspect']) {
  switch (aspect) {
    case '4:5':
      return '3:4';
    case '9:16':
      return '9:16';
    case '16:9':
      return '16:9';
    case '1:1':
      return '1:1';
  }
}

function resolutionForQuality(quality: AiGenerationSettings['quality']) {
  return quality === 'high' ? '2k' : '1k';
}

function dimensionsForAspect(aspectRatio: string, resolution: string) {
  const [w, h] = aspectRatio.split(':').map(Number);
  const longSide = resolution === '2k' ? 2048 : 1024;
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return { width: longSide, height: longSide };
  if (w >= h) return { width: longSide, height: Math.round((longSide * h) / w) };
  return { width: Math.round((longSide * w) / h), height: longSide };
}

function mimeType(value: unknown) {
  return typeof value === 'string' && value.startsWith('image/') ? value : 'image/jpeg';
}

function readXAiError(body: XAiImageResponse, status: number) {
  const message = body.error?.message;
  return typeof message === 'string' && message ? message : `xAI image generation failed with HTTP ${status}.`;
}
