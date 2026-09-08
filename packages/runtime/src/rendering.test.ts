import { describe, expect, it } from 'vitest';
import { applyChromaticAberration, drawEmojiLayer, lcg } from './rendering.js';

interface CapturedEmoji {
  alpha: number;
  emoji: string;
  font: string;
  rotation: number;
  x: number;
  y: number;
}

function captureEmojiField(runtimeEmojiPhase: number, runtimeEmojiDrift: number) {
  const captured: CapturedEmoji[] = [];
  let x = 0;
  let y = 0;
  let rotation = 0;
  const state = { alpha: 1, font: '' };
  const context = {
    fillText(emoji: string) {
      captured.push({ alpha: state.alpha, emoji, font: state.font, rotation, x, y });
    },
    get font() {
      return state.font;
    },
    set font(value: string) {
      state.font = value;
    },
    get globalAlpha() {
      return state.alpha;
    },
    set globalAlpha(value: number) {
      state.alpha = value;
    },
    globalCompositeOperation: 'source-over',
    restore() {},
    rotate(value: number) {
      rotation = value;
    },
    save() {},
    textAlign: 'center',
    textBaseline: 'middle',
    translate(nextX: number, nextY: number) {
      x = nextX;
      y = nextY;
    },
  } as unknown as CanvasRenderingContext2D;

  drawEmojiLayer(
    context,
    512,
    512,
    {
      density: 12,
      emojis: ['✦', '●', '◆'],
      maxSz: 42,
      minSz: 20,
      runtimeEmojiDrift,
      runtimeEmojiPhase,
    },
    lcg(1780509501),
    1,
  );
  return captured;
}

describe('deterministic emoji choreography', () => {
  it('preserves generated item identity and ordering across distinct phase and drift steps', () => {
    const firstStep = captureEmojiField(0.08, 0.01);
    const nextStep = captureEmojiField(0.16, 0.02);

    expect(firstStep).toHaveLength(12);
    expect(nextStep.map(({ alpha, emoji, font }) => ({ alpha, emoji, font }))).toEqual(
      firstStep.map(({ alpha, emoji, font }) => ({ alpha, emoji, font })),
    );
    expect(
      nextStep.some(
        (item, index) =>
          item.x !== firstStep[index]?.x ||
          item.y !== firstStep[index]?.y ||
          item.rotation !== firstStep[index]?.rotation,
      ),
    ).toBe(true);
  });
});

describe('stepped effect pattern phases', () => {
  const sample = (phase?: number) => {
    const rng = lcg(42, phase);
    return Array.from({ length: 4 }, () => rng());
  };
  it('preserves the original seeded pattern at neutral and holds within a phase step', () => {
    expect(sample(0)).toEqual(sample());
    expect(sample(2.2)).toEqual(sample(2.9));
    expect(sample(2)).not.toEqual(sample(3));
    expect(sample(-2)).not.toEqual(sample(2));
    expect(sample(0)).toEqual(sample());
  });
});

it('reuses chromatic sampling geometry without reusing the previous frame pixels', () => {
  const cache = new Map<string, Uint32Array>();
  for (const [width, height, amount, offset] of [
    [8, 6, 2, 0],
    [8, 6, 2, 33],
    [6, 8, 3, 19],
  ]) {
    const input = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 17 + offset) % 256);
    const fresh = input.slice();
    const cached = input.slice();
    applyChromaticAberration(fresh, width, height, amount);
    applyChromaticAberration(cached, width, height, amount, cache);
    expect(cached).toEqual(fresh);
  }
});
