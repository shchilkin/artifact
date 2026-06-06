import { Container, Filter, Graphics, Renderer, Text, TextStyle, Ticker } from 'pixi.js';

const RENDER = 72;
const EMOJI_FONT_FAMILY = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

function createCenteredEmojiText(emoji: string, fontSize = 48) {
  const text = new Text(
    emoji,
    new TextStyle({
      fontFamily: EMOJI_FONT_FAMILY,
      fontSize,
    }),
  );
  text.anchor.set(0.5);
  text.x = RENDER / 2;
  text.y = RENDER / 2;
  return text;
}

function startTicker(onTick: (delta: number) => void): () => void {
  const ticker = new Ticker();
  ticker.add(onTick);
  ticker.start();
  return () => ticker.destroy();
}

function applySignalFilters(
  stage: Container,
  {
    morphAmt,
    caMag,
    grainStrength,
    scanStrength,
  }: { morphAmt: number; caMag: number; grainStrength: number; scanStrength: number },
) {
  const morphU = { uT: 0, uAmt: morphAmt, uFreq: 4.0 };
  const tearU = { uIntensity: 0, uSeed: Math.random() * 9999 };
  const caU = { uMag: caMag };
  const grainU = { uT: 0, uStrength: grainStrength };
  const scanU = { uStrength: scanStrength };
  stage.filters = [
    mkFilter(MORPH_FRAG, morphU),
    mkFilter(TEAR_FRAG, tearU),
    mkFilter(CA_FRAG, caU),
    mkFilter(GRAIN_FRAG, grainU),
    mkFilter(SCAN_FRAG, scanU),
  ];
  return { morphU, tearU, caU, grainU };
}

// ─── shared shader preamble ────────────────────────────────────

const HEADER = `
precision mediump float;
varying vec2 vTextureCoord;
uniform sampler2D uSampler;
uniform vec4 inputClamp;
`;

const NORM_UV = `
  vec2 extent = inputClamp.zw - inputClamp.xy;
  vec2 norm   = (vTextureCoord - inputClamp.xy) / extent;
`;

const SAMPLE = (uv: string) =>
  `texture2D(uSampler, clamp(inputClamp.xy + ${uv} * extent, inputClamp.xy, inputClamp.zw))`;

// ─── Shaders ───────────────────────────────────────────────────

const MORPH_FRAG = `${HEADER}
uniform float uT;
uniform float uAmt;
uniform float uFreq;
void main() {
  ${NORM_UV}
  float wx = sin(norm.y * uFreq + uT * 1.3) * cos(norm.x * uFreq * 0.7 + uT * 0.9);
  float wy = cos(norm.x * uFreq + uT * 0.7) * sin(norm.y * uFreq * 0.8 + uT * 1.1);
  vec2 warped = clamp(norm + vec2(wx, wy) * uAmt, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const TEAR_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;
float hash(float n) { return fract(sin(n * 127.1 + uSeed * 0.01) * 43758.5453); }
void main() {
  ${NORM_UV}
  float chunkId = floor(norm.y / 0.12);
  float active  = step(0.6, hash(chunkId));
  float offset  = (hash(chunkId + 57.3) - 0.5) * 2.0 * uIntensity * active;
  vec2 warped   = vec2(fract(norm.x + offset), norm.y);
  gl_FragColor  = ${SAMPLE('warped')};
}`;

const CA_FRAG = `${HEADER}
uniform float uMag;
void main() {
  vec2 uv  = vTextureCoord;
  vec2 dir = vec2(uMag, uMag * 0.35);
  float r  = texture2D(uSampler, clamp(uv + dir, inputClamp.xy, inputClamp.zw)).r;
  float g  = texture2D(uSampler, uv).g;
  float b  = texture2D(uSampler, clamp(uv - dir, inputClamp.xy, inputClamp.zw)).b;
  float a  = texture2D(uSampler, uv).a;
  gl_FragColor = vec4(r, g, b, a);
}`;

const GRAIN_FRAG = `${HEADER}
uniform float uT;
uniform float uStrength;
float h21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  float g = (h21(norm * 600.0 + uT * 11.7) - 0.5) * uStrength;
  col.rgb += g * col.a;
  gl_FragColor = vec4(clamp(col.rgb, 0.0, 1.0), col.a);
}`;

const SCAN_FRAG = `${HEADER}
uniform float uStrength;
void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  float line = mod(floor(norm.y * 28.0), 2.0);
  col.rgb *= 1.0 - uStrength * (1.0 - line);
  gl_FragColor = col;
}`;

const TINT_FRAG = `${HEADER}
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  vec3 screen = 1.0 - (1.0 - col.rgb) * (1.0 - uColor * uAlpha);
  gl_FragColor = vec4(screen, col.a);
}`;

const STATIC_FRAG = `${HEADER}
uniform float uT;
uniform float uResolve; // 0 = full noise, 1 = clear
float h21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  float noise = h21(norm * 300.0 + uT * 19.3);
  float threshold = 1.0 - uResolve;
  float staticMask = step(uResolve, noise);
  vec3 result = mix(col.rgb, vec3(noise), staticMask * (1.0 - uResolve));
  float alpha = mix(col.a, col.a + noise * (1.0 - uResolve) * 0.6, staticMask);
  gl_FragColor = vec4(result, clamp(alpha, 0.0, 1.0));
}`;

const BLOOM_FRAG = `${HEADER}
uniform float uIntensity;
void main() {
  ${NORM_UV}
  vec4 base = ${SAMPLE('norm')};
  vec3 glow = vec3(0.0);
  float r = uIntensity * 0.04;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.7854;
    vec2 off = vec2(cos(a), sin(a)) * r;
    vec4 s = ${SAMPLE('norm + off')};
    float bright = max(0.0, dot(s.rgb, vec3(0.299, 0.587, 0.114)) - 0.4);
    glow += s.rgb * bright;
  }
  glow /= 8.0;
  gl_FragColor = vec4(min(vec3(1.0), base.rgb + glow * uIntensity * 0.9), base.a);
}`;

const BARREL_FRAG = `${HEADER}
uniform float uK;
void main() {
  ${NORM_UV}
  vec2 c = norm - 0.5;
  float r2 = dot(c, c);
  vec2 warped = clamp((c * (1.0 + uK * r2)) + 0.5, 0.0, 1.0);
  gl_FragColor = ${SAMPLE('warped')};
}`;

const SCATTER_FRAG = `${HEADER}
uniform float uIntensity;
uniform float uSeed;
uniform float uPhase; // 0 = apart, 1 = together
float dmHash(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}
void main() {
  ${NORM_UV}
  float blockSize = 0.1;
  vec2 blockId = floor(norm / blockSize);
  vec2 offset  = (vec2(dmHash(blockId + uSeed), dmHash(blockId + uSeed + 1.3)) - 0.5)
                 * uIntensity * (1.0 - uPhase);
  vec2 warped  = fract(norm + offset);
  gl_FragColor = ${SAMPLE('warped')};
}`;

// ─── Factory ───────────────────────────────────────────────────

function mkFilter(frag: string, uniforms: Record<string, unknown>): Filter {
  const filter = new Filter(undefined, frag, uniforms);
  filter.padding = 12;
  return filter;
}

// ─── Burst scheduler ───────────────────────────────────────────

function makeBurstScheduler(minGap = 3, maxGap = 8) {
  let next = minGap + Math.random() * (maxGap - minGap);
  let timer = 0;
  const HOLD = 0.06;
  const DECAY = 0.28;
  return {
    tick(dtSec: number): number {
      next -= dtSec;
      if (next <= 0) {
        timer = HOLD + DECAY;
        next = minGap + Math.random() * (maxGap - minGap);
      }
      if (timer > 0) {
        timer -= dtSec;
        return Math.max(0, timer / (HOLD + DECAY));
      }
      return 0;
    },
  };
}

// ─── Variant runners ───────────────────────────────────────────

type VariantRunner = (stage: Container, renderer: Renderer, emoji: string, reducedMotion: boolean) => () => void;

// 1. CRT Glitch Burst
const variantGlitch: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const text = createCenteredEmojiText(emoji);
  stage.addChild(text);

  const { morphU, tearU, caU, grainU } = applySignalFilters(stage, {
    morphAmt: 0.008,
    caMag: 0.018,
    grainStrength: 0.38,
    scanStrength: 0.28,
  });
  renderer.render(stage);
  if (reducedMotion) return () => {};

  const burst = makeBurstScheduler();
  return startTicker((delta) => {
    const env = burst.tick(delta / 60);
    morphU.uT += delta * 0.004;
    grainU.uT += delta * 0.006;
    morphU.uAmt = 0.008 + env * 0.055;
    tearU.uIntensity = env * 0.55;
    caU.uMag = 0.018 + env * 0.072;
    grainU.uStrength = 0.38 + env * 0.5;
    renderer.render(stage);
  });
};

// 2. Riso misregistration
const variantRiso: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const INK_A: [number, number, number] = [0.05, 0.85, 0.85];
  const INK_B: [number, number, number] = [0.9, 0.1, 0.5];

  const makeLayer = (ink: [number, number, number], offsetX: number) => {
    const t = new Text(
      emoji,
      new TextStyle({
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        fontSize: 48,
      }),
    );
    t.anchor.set(0.5);
    t.x = RENDER / 2 + offsetX;
    t.y = RENDER / 2;
    const u = { uColor: ink, uAlpha: 0.55 };
    t.filters = [mkFilter(TINT_FRAG, u)];
    return { sprite: t, u };
  };

  const layerA = makeLayer(INK_A, -4);
  const layerB = makeLayer(INK_B, +4);
  stage.addChild(layerA.sprite, layerB.sprite);

  const grainU = { uT: 0, uStrength: 0.22 };
  stage.filters = [mkFilter(GRAIN_FRAG, grainU)];
  renderer.render(stage);
  if (reducedMotion) return () => {};

  let t = 0;
  return startTicker((delta) => {
    t += delta * 0.003;
    const drift = Math.sin(t) * 5;
    layerA.sprite.x = RENDER / 2 - drift;
    layerB.sprite.x = RENDER / 2 + drift;
    grainU.uT += delta * 0.006;
    renderer.render(stage);
  });
};

type StaticPhase = 'noise' | 'tuning' | 'hold' | 'dissolving';
interface StaticPhaseState {
  phase: StaticPhase;
  timer: number;
}

type StaticPhaseHandler = (state: StaticPhaseState, resolveUniform: { uResolve: number }) => StaticPhaseState;

const STATIC_PHASE_HANDLERS: Record<StaticPhase, StaticPhaseHandler> = {
  noise: (state) => (state.timer <= 0 ? { phase: 'tuning', timer: 0.4 } : state),
  tuning: advanceStaticTuningPhase,
  hold: (state) => (state.timer <= 0 ? { phase: 'dissolving', timer: 0.4 } : state),
  dissolving: advanceStaticDissolvingPhase,
};

function advanceStaticPhase(state: StaticPhaseState, resolveUniform: { uResolve: number }): StaticPhaseState {
  return STATIC_PHASE_HANDLERS[state.phase](state, resolveUniform);
}

function advanceStaticTuningPhase(state: StaticPhaseState, resolveUniform: { uResolve: number }): StaticPhaseState {
  resolveUniform.uResolve = Math.min(1, 1 - state.timer / 0.4);
  if (state.timer > 0) return state;
  resolveUniform.uResolve = 1;
  return { phase: 'hold', timer: 2.0 };
}

function advanceStaticDissolvingPhase(state: StaticPhaseState, resolveUniform: { uResolve: number }): StaticPhaseState {
  resolveUniform.uResolve = Math.max(0, state.timer / 0.4);
  if (state.timer > 0) return state;
  resolveUniform.uResolve = 0;
  return { phase: 'noise', timer: 3 + Math.random() * 5 };
}

// 3. Static-to-signal resolver
const variantStatic: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const text = createCenteredEmojiText(emoji);
  stage.addChild(text);

  const staticU = { uT: 0, uResolve: 0 };
  const grainU = { uT: 0, uStrength: 0.15 };
  stage.filters = [mkFilter(STATIC_FRAG, staticU), mkFilter(GRAIN_FRAG, grainU)];

  if (reducedMotion) {
    staticU.uResolve = 1;
    renderer.render(stage);
    return () => {};
  }
  renderer.render(stage);

  let phaseState: StaticPhaseState = { phase: 'noise', timer: 2 + Math.random() * 4 };

  return startTicker((delta) => {
    const dt = delta / 60;
    staticU.uT += delta * 0.012;
    grainU.uT += delta * 0.008;
    phaseState = advanceStaticPhase({ ...phaseState, timer: phaseState.timer - dt }, staticU);
    renderer.render(stage);
  });
};

// 4. Phosphor bloom / CRT
const variantPhosphor: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const bg = new Graphics();
  bg.beginFill(0x0a0612);
  bg.drawRect(0, 0, RENDER, RENDER);
  bg.endFill();
  stage.addChild(bg);

  const text = createCenteredEmojiText(emoji, 45);
  stage.addChild(text);

  const bloomU = { uIntensity: 0.7 };
  const barrelU = { uK: 0.35 };
  const scanU = { uStrength: 0.35 };
  const grainU = { uT: 0, uStrength: 0.18 };
  stage.filters = [
    mkFilter(BLOOM_FRAG, bloomU),
    mkFilter(BARREL_FRAG, barrelU),
    mkFilter(SCAN_FRAG, scanU),
    mkFilter(GRAIN_FRAG, grainU),
  ];
  renderer.render(stage);
  if (reducedMotion) return () => {};

  return startTicker((delta) => {
    grainU.uT += delta * 0.005;
    bloomU.uIntensity = 0.65 + Math.sin(Date.now() * 0.0008) * 0.12;
    renderer.render(stage);
  });
};

type ScatterPhase = 'apart' | 'snapping' | 'hold';
interface ScatterPhaseState {
  phase: ScatterPhase;
  timer: number;
}

type ScatterPhaseHandler = (
  state: ScatterPhaseState,
  scatterUniform: { uPhase: number; uSeed: number },
) => ScatterPhaseState;

const SCATTER_PHASE_HANDLERS: Record<ScatterPhase, ScatterPhaseHandler> = {
  apart: advanceScatterApartPhase,
  snapping: advanceScatterSnappingPhase,
  hold: advanceScatterHoldPhase,
};

function advanceScatterPhase(
  state: ScatterPhaseState,
  scatterUniform: { uPhase: number; uSeed: number },
): ScatterPhaseState {
  return SCATTER_PHASE_HANDLERS[state.phase](state, scatterUniform);
}

function advanceScatterHoldPhase(state: ScatterPhaseState, scatterUniform: { uSeed: number }): ScatterPhaseState {
  if (state.timer > 0) return state;
  scatterUniform.uSeed = Math.random() * 9999;
  return { phase: 'apart', timer: 0.5 + Math.random() * 0.4 };
}

function advanceScatterApartPhase(state: ScatterPhaseState, scatterUniform: { uPhase: number }): ScatterPhaseState {
  scatterUniform.uPhase = Math.max(0, 1 - state.timer / 0.5);
  return state.timer <= 0 ? { phase: 'snapping', timer: 0.18 } : state;
}

function advanceScatterSnappingPhase(state: ScatterPhaseState, scatterUniform: { uPhase: number }): ScatterPhaseState {
  scatterUniform.uPhase = state.timer / 0.18;
  if (state.timer > 0) return state;
  scatterUniform.uPhase = 1;
  return { phase: 'hold', timer: 3 + Math.random() * 5 };
}

// 5. Pixel disintegration
const variantScatter: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const text = createCenteredEmojiText(emoji);
  stage.addChild(text);

  const scatterU = {
    uIntensity: 0.7,
    uSeed: Math.random() * 9999,
    uPhase: 1,
  };
  const grainU = { uT: 0, uStrength: 0.25 };
  stage.filters = [mkFilter(SCATTER_FRAG, scatterU), mkFilter(GRAIN_FRAG, grainU)];
  renderer.render(stage);
  if (reducedMotion) return () => {};

  let phaseState: ScatterPhaseState = { phase: 'hold', timer: 2 + Math.random() * 3 };

  return startTicker((delta) => {
    const dt = delta / 60;
    grainU.uT += delta * 0.007;
    phaseState = advanceScatterPhase({ ...phaseState, timer: phaseState.timer - dt }, scatterU);
    renderer.render(stage);
  });
};

// 6. Interactive trigger
const variantInteractive: VariantRunner = (stage, renderer, emoji, reducedMotion) => {
  const text = createCenteredEmojiText(emoji);
  stage.addChild(text);

  const { morphU, tearU, caU, grainU } = applySignalFilters(stage, {
    morphAmt: 0.003,
    caMag: 0.006,
    grainStrength: 0.18,
    scanStrength: 0.22,
  });
  renderer.render(stage);
  if (reducedMotion) return () => {};

  let burstEnv = 0;
  const canvas = renderer.view as HTMLCanvasElement;
  const triggerEl = canvas.parentElement ?? canvas;
  const fire = () => {
    burstEnv = 1;
  };
  triggerEl.addEventListener('pointerenter', fire);
  triggerEl.addEventListener('click', fire);

  const stopTicker = startTicker((delta) => {
    const dt = delta / 60;
    morphU.uT += delta * 0.004;
    grainU.uT += delta * 0.006;
    burstEnv = Math.max(0, burstEnv - dt / 0.35);
    morphU.uAmt = 0.003 + burstEnv * 0.06;
    tearU.uIntensity = burstEnv * 0.6;
    caU.uMag = 0.006 + burstEnv * 0.08;
    grainU.uStrength = 0.18 + burstEnv * 0.55;
    renderer.render(stage);
  });

  return () => {
    triggerEl.removeEventListener('pointerenter', fire);
    triggerEl.removeEventListener('click', fire);
    stopTicker();
  };
};

// ─── Registry ──────────────────────────────────────────────────

// fallow-ignore-next-line unused-export
export const VARIANTS: VariantRunner[] = [
  variantGlitch,
  variantRiso,
  variantStatic,
  variantPhosphor,
  variantScatter,
  variantInteractive,
];
