export type MotionProperty = 'ca' | 'glitch' | 'grain' | 'scanlines' | 'scanlineWidth' | 'seedOffset';

export interface MotionKeyframe {
  offset: number;
  value: number;
}

export interface MotionTrack {
  layerId: string;
  property: MotionProperty;
  keyframes: MotionKeyframe[];
}

export interface MotionRecipe {
  version: 1;
  mode: 'raster-base-effects';
  durationSeconds: number;
  framesPerSecond?: number;
  maxRenderSize?: number;
  tracks: MotionTrack[];
}

export interface ArtifactEffectLayer {
  [key: string]: unknown;
  id: string;
  kind: 'effect';
  visible?: boolean;
  ca?: number;
  glitch?: number;
  grain?: number;
  scanlines?: number;
  scanlineWidth?: number;
  seedOffset?: number;
}

export interface ArtifactRuntimeProject {
  artifactPackage: 'project';
  manifest: {
    kind: 'artifact-project-package';
    version: number;
    documentSchemaVersion: number;
  };
  document: {
    schemaVersion: number;
    global: {
      seed: number;
      aspect?: string;
    };
    layers: Array<Record<string, unknown>>;
  };
}

export interface ArtifactRuntimePlayer {
  readonly isPlaying: boolean;
  readonly currentTime: number;
  play(): void;
  pause(): void;
  seek(timeSeconds: number): void;
  resize(width: number, height: number): void;
  destroy(): void;
}

export interface CreateArtifactRuntimePlayerOptions {
  canvas: HTMLCanvasElement;
  project: unknown;
  baseImageUrl: string;
  recipe: MotionRecipe;
  pixelRatio?: number;
}
