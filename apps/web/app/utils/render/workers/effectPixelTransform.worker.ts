import {
  type EffectPixelTransformRequest,
  type EffectPixelTransformResult,
  transformEffectPixels,
} from './effectPixelTransform';

type EffectPixelWorkerRequest = {
  id: number;
  request: EffectPixelTransformRequest;
};

type EffectPixelWorkerResponse =
  | {
      id: number;
      result: EffectPixelTransformResult;
    }
  | {
      id: number;
      error: string;
    };

globalThis.addEventListener('message', (event: MessageEvent<EffectPixelWorkerRequest>) => {
  const { id, request } = event.data;
  try {
    const result = transformEffectPixels(request);
    globalThis.postMessage({ id, result } satisfies EffectPixelWorkerResponse, [result.data.buffer]);
  } catch (error) {
    globalThis.postMessage({
      id,
      error: error instanceof Error ? error.message : 'Effect pixel worker failed',
    } satisfies EffectPixelWorkerResponse);
  }
});
