/**
 * Scene lighting for a 3D Object layer: a light rig, an environment map, exposure, and a material look. A 3D layer
 * without `scene` renders with its own default lighting; with it, the layer renders as a full-frame scene over its
 * input (see `docs/rendering.md`).
 */
export interface Scene3DSettings {
  /** Uploaded HDR/EXR environment (an `artifact-env://` reference or data URL); empty when none. */
  environmentSrc: string;
  environmentName: string;
  environmentMime: string;
  environmentBytes: number;
  materialMode: 'original' | 'clay' | 'unlit';
  /** Keeps the environment out of the background, so the layer's input shows behind the object. */
  transparent: boolean;
  exposure: number;
  environmentStrength: number;
  environmentRotation: number;
  ambientIntensity: number;
  keyAzimuth: number;
  keyElevation: number;
  keyIntensity: number;
  fillIntensity: number;
  rimIntensity: number;
}

export const SCENE3D_DEFAULTS = {
  environmentSrc: '',
  environmentName: '',
  environmentMime: '',
  environmentBytes: 0,
  materialMode: 'original',
  transparent: true,
  exposure: 100,
  environmentStrength: 100,
  environmentRotation: 0,
  ambientIntensity: 115,
  keyAzimuth: 38,
  keyElevation: 42,
  keyIntensity: 145,
  fillIntensity: 65,
  rimIntensity: 55,
} as const satisfies Scene3DSettings;

export function makeScene3DSettings(partial: Partial<Scene3DSettings> = {}): Scene3DSettings {
  return { ...SCENE3D_DEFAULTS, ...partial };
}
