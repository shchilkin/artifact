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

export const MIXED_MEDIA_2D_PROFILE = 'mixed-media-2d@1' as const;

export type MixedMediaRuntimeProfile = typeof MIXED_MEDIA_2D_PROFILE;
export type MixedMediaTemporalMode = 'loop' | 'once';
export type MixedMediaMotionControl =
  | 'transform.translateX'
  | 'transform.translateY'
  | 'transform.rotate'
  | 'transform.scale'
  | 'transform.opacity'
  | 'emoji.phase'
  | 'emoji.drift'
  | 'effect.grain.intensity'
  | 'effect.glitch.intensity'
  | 'effect.noiseWarp.intensity'
  | 'effect.vortex.intensity'
  | 'effect.tear.intensity'
  | 'effect.scanlines.intensity'
  | 'effect.chromaticAberration.intensity';

export interface MixedMediaKeyframeSource {
  type: 'keyframes';
  keyframes: MotionKeyframe[];
}

export interface MixedMediaOscillatorSource {
  type: 'oscillator';
  frequencyHz: number;
}

export interface MixedMediaSeededNoiseSource {
  type: 'seeded-noise';
  seed: number;
  frequencyHz: number;
}

export type MixedMediaMotionSource =
  | MixedMediaKeyframeSource
  | MixedMediaOscillatorSource
  | MixedMediaSeededNoiseSource;

export interface MixedMediaMotionTrack {
  id: string;
  target: {
    layerId: string;
    layerKind: string;
  };
  control: MixedMediaMotionControl;
  source: MixedMediaMotionSource;
  range: {
    min: number;
    max: number;
  };
  stepFps?: number;
}

export interface MixedMediaMotionRecipe {
  kind: 'artifact-motion-recipe';
  schemaVersion: 1;
  profile: MixedMediaRuntimeProfile;
  compositionSha256: string;
  timeline: {
    durationSeconds: number;
    mode: MixedMediaTemporalMode;
  };
  tracks: MixedMediaMotionTrack[];
}

export type MixedMediaRecipeIssueCode =
  | 'duplicate-target-control'
  | 'duplicate-track-id'
  | 'invalid-range'
  | 'invalid-recipe'
  | 'invalid-source'
  | 'missing-layer'
  | 'neutral-frame-violation'
  | 'unsupported-control'
  | 'unsupported-profile'
  | 'wrong-layer-kind';

export interface MixedMediaRecipeIssue {
  code: MixedMediaRecipeIssueCode;
  message: string;
  trackId?: string;
}

export interface MixedMediaRecipeProvenance {
  expectedSha256: string;
  actualSha256?: string;
  status: 'match' | 'mismatch' | 'unverified';
}

export interface MixedMediaRecipeCompatibilityReport {
  compatible: boolean;
  issues: MixedMediaRecipeIssue[];
  profile: MixedMediaRuntimeProfile;
  provenance: MixedMediaRecipeProvenance;
}

export type EvaluatedMotionByLayer = Map<string, Partial<Record<MixedMediaMotionControl, number>>>;

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

export type ArtifactRuntimeCapabilityStatus = 'ready' | 'unresolved-fonts' | 'unsupported';

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

export interface ArtifactRuntimeUnresolvedFont {
  ref: string;
  layerIds: string[];
}

export interface ArtifactRuntimeCapabilityReport {
  supported: boolean;
  status: ArtifactRuntimeCapabilityStatus;
  mode: ArtifactRuntimeRenderMode;
  layerOrder: string[];
  requiredFonts: string[];
  unresolvedFonts: ArtifactRuntimeUnresolvedFont[];
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

export interface MixedMediaArtworkFrameDiagnostics {
  choreographyTime: number;
  renderDurationMs: number;
  width: number;
  height: number;
}

export interface MixedMediaArtworkSession {
  readonly capabilityReport: ArtifactRuntimeCapabilityReport;
  readonly compatibilityReport: MixedMediaRecipeCompatibilityReport;
  readonly currentTime: number;
  readonly isRunning: boolean;
  start(): void;
  pause(): void;
  seek(timeSeconds: number): Promise<void>;
  resize(width: number, height: number): Promise<void>;
  destroy(): void;
}

export interface CreateMixedMediaArtworkOptions extends AnalyzeArtifactRuntimeProjectOptions {
  canvas: HTMLCanvasElement;
  composition: unknown;
  compositionSha256?: string;
  maxRenderSize?: number;
  motionRecipe: MixedMediaMotionRecipe;
  onFrame?: (diagnostics: MixedMediaArtworkFrameDiagnostics) => void;
  onRenderError?: (error: unknown) => void;
  pixelRatio?: number;
  profile: MixedMediaRuntimeProfile;
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
