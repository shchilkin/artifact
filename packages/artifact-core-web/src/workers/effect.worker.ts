import init, { render_effect } from '../../generated/artifact_wasm';
import type { EffectRequest, EffectResponse } from './effectProtocol';

// One WASM instance per render job, reused by its sequential effects.
let ready: ReturnType<typeof init> | undefined;
self.onmessage = async (event: MessageEvent<EffectRequest>) => {
  const { id, pixels, width, height, layerJSON, seed } = event.data;
  try {
    await (ready ??= init());
    const result = render_effect(pixels, width, height, layerJSON, seed);
    if (!(result.buffer instanceof ArrayBuffer)) throw new Error('Effect returned a non-transferable buffer');
    const response: EffectResponse = {
      id,
      pixels: new Uint8Array(result.buffer, result.byteOffset, result.byteLength),
    };
    self.postMessage(response, { transfer: [result.buffer] });
  } catch (error) {
    const response: EffectResponse = { id, error: error instanceof Error ? error.message : String(error) };
    self.postMessage(response);
  }
};
