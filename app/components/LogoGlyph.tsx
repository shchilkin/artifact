import { useLayoutEffect, useRef } from 'react';
import { Filter, Renderer, Container, Text, TextStyle, Ticker } from 'pixi.js';
import { ALL_EMOJIS } from '../types/config';

const SIZE = 40;

// ─── shared shader preamble (matches pixiFilters.ts conventions) ───

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

// ─── Slow organic morph ────────────────────────────────────────

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

// ─── Chromatic aberration ──────────────────────────────────────

const CA_FRAG = `${HEADER}
uniform vec2 uDir;

void main() {
  vec2 uv = vTextureCoord;
  float r = texture2D(uSampler, clamp(uv + uDir,  inputClamp.xy, inputClamp.zw)).r;
  float g = texture2D(uSampler, uv).g;
  float b = texture2D(uSampler, clamp(uv - uDir,  inputClamp.xy, inputClamp.zw)).b;
  float a = texture2D(uSampler, uv).a;
  gl_FragColor = vec4(r, g, b, a);
}`;

// ─── Film grain (animated, alpha-masked so it only touches the glyph) ──

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
  float g = (h21(norm * 400.0 + uT * 7.3) - 0.5) * uStrength;
  col.rgb += g * col.a;
  gl_FragColor = vec4(clamp(col.rgb, 0.0, 1.0), col.a);
}`;

// ─── Scanlines ─────────────────────────────────────────────────

const SCAN_FRAG = `${HEADER}
uniform float uStrength;

void main() {
  vec4 col = texture2D(uSampler, vTextureCoord);
  ${NORM_UV}
  float line = mod(floor(norm.y * 22.0), 2.0);
  col.rgb *= 1.0 - uStrength * (1.0 - line);
  gl_FragColor = col;
}`;

// ─── Factory ───────────────────────────────────────────────────

function mkFilter(frag: string, uniforms: Record<string, unknown>): Filter {
  const filter = new Filter(undefined, frag, uniforms);
  filter.padding = 6;
  return filter;
}

// ─── Component ─────────────────────────────────────────────────

export function LogoGlyph() {
  const wrapRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const emoji = ALL_EMOJIS[Math.floor(Math.random() * ALL_EMOJIS.length)];

    let renderer: Renderer;
    try {
      renderer = new Renderer({
        width: SIZE,
        height: SIZE,
        backgroundAlpha: 0,
        antialias: false,
      });
    } catch {
      return;
    }

    const canvas = renderer.view as HTMLCanvasElement;
    canvas.style.cssText = 'display:block;width:40px;height:40px;';
    wrap.appendChild(canvas);

    const stage = new Container();

    const text = new Text(
      emoji,
      new TextStyle({
        fontFamily: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
        fontSize: 26,
      }),
    );
    text.anchor.set(0.5);
    text.x = SIZE / 2;
    text.y = SIZE / 2;
    stage.addChild(text);

    // Live uniform objects — mutated each tick, read by Pixi on render
    const morphU = { uT: 0, uAmt: 0.012, uFreq: 3.5 };
    const caU    = { uDir: [0.012, 0.004] };
    const grainU = { uT: 0, uStrength: 0.22 };
    const scanU  = { uStrength: 0.2 };

    stage.filters = [
      mkFilter(MORPH_FRAG, morphU),
      mkFilter(CA_FRAG,    caU),
      mkFilter(GRAIN_FRAG, grainU),
      mkFilter(SCAN_FRAG,  scanU),
    ];

    renderer.render(stage);

    const ticker = new Ticker();
    ticker.add((delta) => {
      morphU.uT += delta * 0.003;
      grainU.uT += delta * 0.003;
      renderer.render(stage);
    });
    ticker.start();

    return () => {
      ticker.destroy();
      renderer.destroy(true);
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      aria-hidden="true"
      style={{ width: 40, height: 40, flexShrink: 0 }}
    />
  );
}
