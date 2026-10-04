import type { FrameState } from '../artwork.js';
import type { ChainPass, UniformValues } from '../types.js';

/**
 * One declaration per effect drives the whole harness (issue #331): static parity against the editor, motion and
 * input goldens, GPU timing, and the `/dev/runtime` catalogue entry. Cases live in `packages/runtime/test/cases`.
 */

/** Source images under `packages/runtime/test/fixtures`, each 540px square. */
export type FixtureName = 'photo' | 'graphic' | 'text';

export const FIXTURES: readonly FixtureName[] = ['photo', 'graphic', 'text'];

export const FIXTURE_FILES: Readonly<Record<FixtureName, string>> = {
  photo: 'photo.webp',
  graphic: 'graphic.png',
  text: 'text.png',
};

/** One golden frame: the artwork seeked to `t` seconds with these inputs set. */
export interface CaseFrame {
  /** File-safe name, unique within the case. Becomes the golden's file name. */
  readonly name: string;
  readonly t: number;
  /** Values passed to `setInput` before the frame is drawn, for example `{ 'pointer.x': 0.5 }`. */
  readonly input?: Readonly<Record<string, number>>;
}

/** Time samples every animated effect records: `t = 0, 0.25, 0.5, 0.75`. */
export const MOTION_FRAMES: readonly CaseFrame[] = [0, 0.25, 0.5, 0.75].map((t) => ({ name: `t-${t}`, t }));

/** Pointer samples for effects with an input binding: centre, a corner, and a fast pointer. */
export const INPUT_FRAMES: readonly CaseFrame[] = [
  { name: 'pointer-centre', t: 0, input: { 'pointer.x': 0.5, 'pointer.y': 0.5, 'pointer.speed': 0 } },
  { name: 'pointer-corner', t: 0, input: { 'pointer.x': 1, 'pointer.y': 1, 'pointer.speed': 0 } },
  { name: 'pointer-speed', t: 0, input: { 'pointer.x': 0.5, 'pointer.y': 0.5, 'pointer.speed': 1 } },
];

export interface EffectCase {
  /** Registry id, which is also the editor's effect preset id. */
  readonly effect: string;
  /** Authored values, merged over the editor's preset layer (`makeEffectPresetLayer(effect)`). */
  readonly layer: Readonly<Record<string, number | string | boolean>>;
  /** `doc.global.seed`. Default 11. */
  readonly seed?: number;
  /** Fixtures for static parity. Default: all three. */
  readonly fixtures?: readonly FixtureName[];
  /** Fixture for goldens. Default `graphic`, whose flat colours keep the PNGs small. */
  readonly goldenFixture?: FixtureName;
  /** Golden frames. Default: none (a static effect only needs parity). */
  readonly frames?: readonly CaseFrame[];
  /**
   * Per-frame uniforms for the effect's pass, merged over its resting uniforms. A stand-in for the time tracks and
   * input bindings of issue #332: when those land, a case declares its binding instead and the harness drives it
   * through the same `seek` and `setInput` calls.
   */
  readonly frameUniforms?: (frame: FrameState, pass: ChainPass) => UniformValues | undefined;
}

export const DEFAULT_CASE_SEED = 11;
/** Static parity and GPU timing size. */
export const PARITY_SIZE = 540;
/** Golden size: half of the parity size keeps the committed PNGs small while every pass still runs. */
export const GOLDEN_SIZE = 270;

export function defineEffectCase(effectCase: EffectCase): EffectCase {
  return effectCase;
}
