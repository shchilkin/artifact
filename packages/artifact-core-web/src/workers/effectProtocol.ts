/** Transient pixel data only: never persisted in the document. */
export interface EffectRequest {
  id: number;
  pixels: Uint8Array<ArrayBuffer>;
  width: number;
  height: number;
  layerJSON: string;
  seed: number;
}

export type EffectResponse = { id: number; pixels: Uint8Array<ArrayBuffer> } | { id: number; error: string };
