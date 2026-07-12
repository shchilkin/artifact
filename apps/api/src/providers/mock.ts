import type { AiProvider } from '../contracts.js';
import type { ImageGenerationProvider, ImageGenerationRequest, ImageGenerationResult } from './index.js';

export interface MockImageProviderOptions {
  provider: AiProvider;
  defaultModel?: string;
}

export function createMockImageProvider(options: MockImageProviderOptions): ImageGenerationProvider {
  const defaultModel = options.defaultModel ?? `${options.provider}-mock-image`;

  return {
    provider: options.provider,
    defaultModel,
    async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
      const svg = createMockSvg(request);

      return {
        provider: request.provider,
        model: request.model,
        mimeType: 'image/svg+xml',
        bytes: new TextEncoder().encode(svg),
        width: 1024,
        height: 1024,
        usage: {
          estimatedCostUsd: 0,
          metrics: { imageCount: 1 },
          metadata: {
            mock: true,
            promptLength: request.prompt.length,
          },
        },
      };
    },
  };
}

function createMockSvg(request: ImageGenerationRequest) {
  const title = escapeSvg(`${request.provider} / ${request.model}`);
  const prompt = escapeSvg(request.prompt);
  const style = escapeSvg(request.settings.stylePreset ?? 'unstyled');
  const quality = escapeSvg(request.settings.quality);
  const aspect = escapeSvg(request.settings.aspect);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect width="1024" height="1024" fill="#111827"/>
  <rect x="96" y="96" width="832" height="832" rx="32" fill="#f8fafc"/>
  <text x="144" y="188" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#111827">${title}</text>
  <text x="144" y="280" font-family="Arial, sans-serif" font-size="28" fill="#334155">${prompt}</text>
  <text x="144" y="820" font-family="Arial, sans-serif" font-size="24" fill="#475569">aspect ${aspect} | ${quality} | ${style}</text>
</svg>`;
}

function escapeSvg(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}
