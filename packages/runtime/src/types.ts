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
      bg?: string;
      seed: number;
      aspect?: string;
    };
    layers: Array<Record<string, unknown>>;
    graph?: ArtifactRuntimeGraph;
  };
}

export interface ArtifactRuntimeGraphEdge {
  id?: string;
  fromId: string;
  toId: string;
  fromPort?: string;
  toPort?: string;
}

export interface ArtifactRuntimeGraph {
  edges: ArtifactRuntimeGraphEdge[];
  mergeNodes?: unknown[];
  colorNodes?: unknown[];
  repeatNodes?: unknown[];
  materialNodes?: unknown[];
  maskNodes?: unknown[];
  transformNodes?: unknown[];
  grimeShadowNodes?: unknown[];
  scene3dNodes?: unknown[];
  environmentNodes?: unknown[];
  shaderNodes?: unknown[];
}

export type ArtifactRuntimeRenderMode = 'stack' | 'linear-graph';

export type ArtifactRuntimeCapabilityCode =
  | 'invalid-graph'
  | 'missing-font'
  | 'missing-image'
  | 'unsupported-effect'
  | 'unsupported-graph-node'
  | 'unsupported-layer-kind';

export interface ArtifactRuntimeCapabilityIssue {
  code: ArtifactRuntimeCapabilityCode;
  graphNodeId?: string;
  message: string;
  layerId?: string;
}

export interface ArtifactRuntimeCapabilityReport {
  supported: boolean;
  mode: ArtifactRuntimeRenderMode;
  layerOrder: string[];
  requiredFonts: string[];
  issues: ArtifactRuntimeCapabilityIssue[];
}

export interface AnalyzeArtifactRuntimeProjectOptions {
  fontFamilies?: Readonly<Record<string, string>>;
}

export interface RenderArtifactRuntimeProjectOptions extends AnalyzeArtifactRuntimeProjectOptions {
  canvas: HTMLCanvasElement;
  project: unknown;
  width: number;
  height: number;
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
