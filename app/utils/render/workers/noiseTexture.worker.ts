import { generateNoiseTextureData, type NoiseTextureRequest, type NoiseTextureResult } from './noiseTexture';

type NoiseTextureWorkerRequest = {
  id: number;
  request: NoiseTextureRequest;
};

type NoiseTextureWorkerResponse =
  | {
      id: number;
      result: NoiseTextureResult;
    }
  | {
      id: number;
      error: string;
    };

globalThis.addEventListener('message', (event: MessageEvent<NoiseTextureWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = generateNoiseTextureData(request);
    globalThis.postMessage({ id, result } satisfies NoiseTextureWorkerResponse, [result.data.buffer]);
  } catch (error) {
    globalThis.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Noise texture worker failed',
    } satisfies NoiseTextureWorkerResponse);
  }
});
