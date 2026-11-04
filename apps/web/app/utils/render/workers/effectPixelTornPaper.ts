/**
 * The torn paper kernel: tears the input like a printed sheet. One tear line (a slow wander, a jagged middle, rare
 * tongues, and fine teeth) splits the sheet. Along it the print gives way to the exposed white paper core, whose
 * width varies a lot, with paper fibres pulling into the print and a soft, fibrous outer lip. `reveal` keeps one
 * piece over what is below; `split` keeps both, the second pulled away and turned so the gap opens from one end.
 *
 * Every length is authored at 540px and multiplied by `unit` (output width / 540), and the tear is measured along
 * its own axis, so the shape matches between preview, thumbnails, and export at any size or angle.
 */
import { hexByte } from './effectPixelHelpers';

export interface TornPaperSettings {
  mode: 'reveal' | 'split';
  /** Which piece `reveal` keeps. */
  keep: 'top' | 'bottom';
  /** Jaggedness of the tear, 0-100. */
  roughness: number;
  /** Where the tear crosses the frame, 0-100 along its normal. */
  position: number;
  /** Tilt of the tear, degrees. */
  angle: number;
  /** Large slow curve of the tear, 0-100. */
  wander: number;
  /** Average width of exposed paper core, px at 540. */
  rim: number;
  /** Loose fibres past the edge, 0-100. */
  fibres: number;
  /** Shadow opacity, 0-100. */
  shadow: number;
  /** How far the torn piece lifts off what is below, px at 540. */
  lift: number;
  /** Split only: distance between the pieces at their closest end, px at 540. */
  gap: number;
  /** Split only: how far the second piece turns, degrees. The gap opens away from its closest end. */
  turn: number;
  paperColor: string;
  below: 'paper' | 'solid' | 'clear';
  belowColor: string;
  /** Output width / 540. */
  unit: number;
  seed: number;
}

// ---------- deterministic noise ----------

function hash(i: number, seed: number): number {
  let h = Math.imul(i ^ Math.imul(seed, 0x9e3779b1), 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function hash2(x: number, y: number, seed: number): number {
  return hash(x + Math.imul(y, 0x27d4eb2d), seed);
}

function fade(t: number) {
  return t * t * (3 - 2 * t);
}

function noise1(x: number, seed: number): number {
  const i = Math.floor(x);
  const u = fade(x - i);
  return hash(i, seed) * (1 - u) + hash(i + 1, seed) * u;
}

function fbm1(x: number, seed: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let k = 0; k < octaves; k += 1) {
    sum += amp * noise1(x * freq, seed + k * 19);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function noise2(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const ux = fade(x - ix);
  const uy = fade(y - iy);
  const a = hash2(ix, iy, seed);
  const b = hash2(ix + 1, iy, seed);
  const c = hash2(ix, iy + 1, seed);
  const d = hash2(ix + 1, iy + 1, seed);
  return (a * (1 - ux) + b * ux) * (1 - uy) + (c * (1 - ux) + d * ux) * uy;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smooth(edge0: number, edge1: number, value: number) {
  return fade(clamp((value - edge0) / (edge1 - edge0), 0, 1));
}

function rgbOf(hex: string): [number, number, number] {
  return [hexByte(hex, 1), hexByte(hex, 3), hexByte(hex, 5)];
}

// ---------- tear profile ----------

/** The tear, sampled once per output pixel along its axis. Offsets and widths are in output px. */
interface TearProfile {
  /** Index of along-axis coordinate 0. */
  origin: number;
  line: Float32Array;
  rimFirst: Float32Array;
  rimSecond: Float32Array;
  lift: Float32Array;
}

function buildProfile(length: number, s: TornPaperSettings): TearProfile {
  const { unit, seed } = s;
  const rough = s.roughness / 60;
  const wander = (s.wander / 50) * 19;
  const count = length * 2 + 3;
  const origin = length + 1;
  const line = new Float32Array(count);
  const rimFirst = new Float32Array(count);
  const rimSecond = new Float32Array(count);
  const lift = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const x = (index - origin) / unit; // along the tear, in 540px units
    const xw = x + (fbm1(x / 45, seed + 2, 3) - 0.5) * 25; // uneven rhythm
    const big = (fbm1(x / 160, seed, 3) - 0.5) * 2 * wander;
    const mid = (fbm1(xw / 21, seed + 5, 4) - 0.5) * 2 * 4 * rough;
    const ridge = Math.pow(1 - Math.abs(2 * fbm1(xw / 11, seed + 13, 3) - 1), 5);
    const tongue = ridge * 3.5 * rough * (hash(Math.floor(xw / 30), seed + 17) > 0.5 ? 1 : -1);
    const teeth = (fbm1(x / 1.1, seed + 9, 2) - 0.5) * 2 * 0.55 * rough;
    line[index] = (big + mid + tongue + teeth) * unit;

    const broad = Math.pow(fbm1(x / 47.5, seed + 31, 4), 1.8) * 2.4;
    const flag = Math.pow(noise1(xw / 24, seed + 37), 5) * 3.2;
    const ragged = (fbm1(x / 1.75, seed + 41, 3) - 0.5) * 0.5 * Math.min(1, rough);
    const width = clamp(0.1 + broad + flag + ragged, 0.08, 4);
    rimFirst[index] = s.rim * width * unit;
    // the other piece keeps the paper the first one lost
    rimSecond[index] = s.rim * 0.45 * clamp(1.6 - width * 0.6 + ragged, 0.1, 2.2) * unit;
    lift[index] = s.lift * (0.35 + 1.1 * fbm1(x / 115, seed + 51, 2)) * unit;
  }
  return { origin, line, rimFirst, rimSecond, lift };
}

function sampleProfile(values: Float32Array, origin: number, along: number) {
  const position = clamp(along + origin, 0, values.length - 1.001);
  const index = Math.floor(position);
  const t = position - index;
  return values[index] * (1 - t) + values[index + 1] * t;
}

// ---------- pieces ----------

interface Frame {
  /** Unit vector along the tear. */
  tx: number;
  ty: number;
  /** Unit normal, pointing from the first piece to the second. */
  nx: number;
  ny: number;
  /** A point on the straight tear. */
  px: number;
  py: number;
  /** Half the frame's extent along the tear. */
  halfAlong: number;
}

function tearFrame(width: number, height: number, s: TornPaperSettings): Frame {
  const angle = (s.angle * Math.PI) / 180;
  const tx = Math.cos(angle);
  const ty = Math.sin(angle);
  const nx = -ty;
  const ny = tx;
  const across = Math.abs(width * nx) + Math.abs(height * ny);
  const offset = (s.position / 100 - 0.5) * across;
  return {
    tx,
    ty,
    nx,
    ny,
    px: width / 2 + nx * offset,
    py: height / 2 + ny * offset,
    halfAlong: (Math.abs(width * tx) + Math.abs(height * ty)) / 2,
  };
}

/** A piece's placement: the sheet point under an output point, in tear coordinates (along, across). */
interface Placement {
  /** +1: the piece lies before the tear (the top piece); -1: after it. */
  side: 1 | -1;
  rim: Float32Array;
  saltSeed: number;
  gap: number;
  /** Rotation about `pivot` (along-axis), radians, sign chosen so the gap opens away from the pivot. */
  turn: number;
  pivot: number;
}

const PAPER_TINT_NEAR_INK = 0.07;

/**
 * Draws one piece into `rgba`/`alpha` (straight colour, coverage 0-1). Returns nothing; the caller composites.
 */
function renderPiece(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  frame: Frame,
  profile: TearProfile,
  placement: Placement,
  s: TornPaperSettings,
  out: Float32Array,
) {
  const { unit } = s;
  const paper = rgbOf(s.paperColor);
  const fibreDensity = (s.fibres / 40) * 0.07;
  const fibreLen = 3.5 * unit;
  const fuzz = 1.1 * unit * (0.4 + s.fibres / 100);
  const seed = s.seed + placement.saltSeed;
  const cos = Math.cos(placement.turn);
  const sin = Math.sin(placement.turn);
  const reach = -(fibreLen * 2.5 + 2);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x + 0.5 - frame.px;
      const dy = y + 0.5 - frame.py;
      // output point in tear coordinates
      const a0 = dx * frame.tx + dy * frame.ty;
      const c0 = dx * frame.nx + dy * frame.ny - placement.gap;
      // undo the piece's turn about its pivot
      const ra = a0 - placement.pivot;
      const along = placement.pivot + ra * cos + c0 * sin;
      const across = -ra * sin + c0 * cos;

      const tear = sampleProfile(profile.line, profile.origin, along);
      const inside = placement.side * (tear - across); // px into the piece
      const o = (y * width + x) * 4;
      if (inside < reach) continue;

      const au = along / unit;
      const cu = across / unit;
      if (inside > 0) {
        const rim = sampleProfile(placement.rim, profile.origin, along);
        const lean = (noise1(au / 9, seed + 4) - 0.5) * 1.2;
        const streakAlong = au + lean * (inside / unit - rim / unit);
        // paper fibres pull into the print as thin streaks across the tear
        const streak =
          (Math.pow(noise2(streakAlong / 0.55, cu / 4.5, seed + 3), 9) * ((rim / unit) * 0.8 + 2) +
            Math.pow(noise2(streakAlong / 0.3, cu / 1.5, seed + 5), 12) * 0.75) *
          unit;
        const inkEdge = rim + streak;
        const tex =
          0.955 + 0.045 * noise2(au / 0.35, cu / 1.75, seed + 11) - 0.02 * noise2(au / 2.5, cu / 2.5, seed + 12);
        const nearInk = smooth(0.6 * unit, 0, inkEdge - inside);
        const shade = tex * (1 - PAPER_TINT_NEAR_INK * nearInk);
        let r = paper[0] * shade;
        let g = paper[1] * shade;
        let b = paper[2] * shade;
        // thin, slightly translucent lip at the very edge; coverage antialiases the outline
        let alpha = (1 - (1 - smooth(0, 1.1 * unit, inside)) * 0.35) * clamp(inside + 0.5, 0, 1);
        const blend = Math.max(0.35 * unit, 0.5);
        const ink = smooth(inkEdge - blend, inkEdge + blend, inside);
        if (ink > 0) {
          // the sheet point in output pixels, before the piece moved
          const sx = clamp(Math.round(frame.px + along * frame.tx + across * frame.nx - 0.5), 0, width - 1);
          const sy = clamp(Math.round(frame.py + along * frame.ty + across * frame.ny - 0.5), 0, height - 1);
          const si = (sy * width + sx) * 4;
          const scuff =
            smooth(inkEdge + 1.5 * unit, inkEdge, inside) *
            (0.25 + 0.5 * noise2(au / 0.75, cu / 0.75, seed + 21)) *
            0.35;
          const sa = source[si + 3] / 255;
          const ir = source[si] + (paper[0] - source[si]) * scuff;
          const ig = source[si + 1] + (paper[1] - source[si + 1]) * scuff;
          const ib = source[si + 2] + (paper[2] - source[si + 2]) * scuff;
          r = r * (1 - ink) + ir * ink;
          g = g * (1 - ink) + ig * ink;
          b = b * (1 - ink) + ib * ink;
          alpha = alpha * (1 - ink) + sa * ink;
        }
        out[o] = r;
        out[o + 1] = g;
        out[o + 2] = b;
        out[o + 3] = alpha;
      } else {
        const beyond = -inside;
        const fz = fuzz * (0.4 + 1.2 * noise2(au / 1.5, cu / 1.5, seed + 97));
        let fibre = beyond < fz ? 0.5 * Math.pow(1 - beyond / fz, 1.6) : 0;
        if (fibreDensity > 0) {
          for (let h = 0; h < 3; h += 1) {
            const lean = (hash(Math.floor(au / 1.25) + h * 977, seed + 61) - 0.5) * 1.8;
            const column = Math.round((au + (lean * beyond) / unit) * 4);
            if (hash(column * 3 + h, seed + 71) > fibreDensity) continue;
            const length = fibreLen * (0.3 + 1.7 * Math.pow(hash(column * 5 + h, seed + 81), 1.5));
            if (beyond < length)
              fibre = Math.max(fibre, (1 - beyond / length) * (0.3 + 0.45 * hash(column, seed + 91)));
          }
        }
        if (fibre > 0) {
          out[o] = paper[0];
          out[o + 1] = paper[1];
          out[o + 2] = paper[2];
          out[o + 3] = fibre * Math.min(1, unit * 2);
        }
      }
    }
  }
}

// ---------- shadow ----------

function boxBlurAlpha(values: Float32Array, width: number, height: number, radius: number) {
  const r = Math.round(radius);
  if (r < 1) return values;
  const temp = new Float32Array(values.length);
  const out = new Float32Array(values.length);
  const span = 2 * r + 1;
  for (let y = 0; y < height; y += 1) {
    let sum = 0;
    const row = y * width;
    for (let x = -r; x <= r; x += 1) sum += values[row + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x += 1) {
      temp[row + x] = sum / span;
      sum += values[row + Math.min(width - 1, x + r + 1)] - values[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < width; x += 1) {
    let sum = 0;
    for (let y = -r; y <= r; y += 1) sum += temp[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y += 1) {
      out[y * width + x] = sum / span;
      sum += temp[Math.min(height - 1, y + r + 1) * width + x] - temp[Math.max(0, y - r) * width + x];
    }
  }
  return out;
}

function gaussianishBlur(values: Float32Array, width: number, height: number, sigma: number) {
  // three box passes approximate a gaussian
  const radius = Math.max(0, Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2 - 0.5);
  let current = values;
  for (let pass = 0; pass < 3; pass += 1) current = boxBlurAlpha(current, width, height, radius);
  return current;
}

/** Shadow coverage of a piece: its alpha pushed along the normal by the lift (which varies along the edge). */
function shadowAlpha(
  piece: Float32Array,
  width: number,
  height: number,
  frame: Frame,
  profile: TearProfile,
  s: TornPaperSettings,
) {
  const opacity = s.shadow / 100;
  const shifted = new Float32Array(width * height);
  const contact = new Float32Array(width * height);
  const contactShift = 1.2 * s.unit;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const along = (x + 0.5 - frame.px) * frame.tx + (y + 0.5 - frame.py) * frame.ty;
      const lift = sampleProfile(profile.lift, profile.origin, along);
      // shadows fall down the frame, whatever the tear angle
      const fromY = Math.round(y - lift);
      const contactY = Math.round(y - contactShift);
      const index = y * width + x;
      shifted[index] = fromY >= 0 && fromY < height ? piece[(fromY * width + x) * 4 + 3] : 0;
      contact[index] = contactY >= 0 && contactY < height ? piece[(contactY * width + x) * 4 + 3] : 0;
    }
  }
  const soft = gaussianishBlur(shifted, width, height, s.lift * 0.45 * s.unit);
  const tight = gaussianishBlur(contact, width, height, 0.45 * s.unit);
  const result = new Float32Array(width * height);
  for (let i = 0; i < result.length; i += 1) {
    const a = soft[i] * opacity;
    const b = tight[i] * opacity * 0.85;
    result[i] = 1 - (1 - a) * (1 - b);
  }
  return result;
}

// ---------- composite ----------

function fillBelow(out: Float32Array, width: number, height: number, s: TornPaperSettings) {
  if (s.below === 'clear') return;
  const [r, g, b] = rgbOf(s.belowColor);
  const textured = s.below === 'paper';
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const t = textured
        ? 0.955 +
          0.045 * noise2(x / (1.1 * s.unit), y / (1.1 * s.unit), 5) -
          0.035 * noise2(x / (30 * s.unit), y / (30 * s.unit), 6)
        : 1;
      const o = (y * width + x) * 4;
      out[o] = r * t;
      out[o + 1] = g * t;
      out[o + 2] = b * t;
      out[o + 3] = 1;
    }
  }
}

/** Straight-alpha "over" of a colour with coverage `a` onto `out`. */
function over(out: Float32Array, o: number, r: number, g: number, b: number, a: number) {
  if (a <= 0) return;
  const da = out[o + 3];
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  out[o] = (r * a + out[o] * da * (1 - a)) / oa;
  out[o + 1] = (g * a + out[o + 1] * da * (1 - a)) / oa;
  out[o + 2] = (b * a + out[o + 2] * da * (1 - a)) / oa;
  out[o + 3] = oa;
}

function drawPiece(out: Float32Array, piece: Float32Array, shadow: Float32Array | null) {
  const pixels = out.length / 4;
  for (let i = 0; i < pixels; i += 1) {
    const o = i * 4;
    if (shadow) over(out, o, 0, 0, 0, shadow[i]);
    over(out, o, piece[o], piece[o + 1], piece[o + 2], piece[o + 3]);
  }
}

export function applyTornPaper(source: Uint8ClampedArray, width: number, height: number, s: TornPaperSettings) {
  const frame = tearFrame(width, height, s);
  const profile = buildProfile(Math.ceil(Math.hypot(width, height) / 2) + 2, s);
  const out = new Float32Array(width * height * 4);
  fillBelow(out, width, height, s);

  const first: Placement = { side: 1, rim: profile.rimFirst, saltSeed: 0, gap: 0, turn: 0, pivot: 0 };
  const pieces: Placement[] = [];
  if (s.mode === 'split') {
    const turn = (Math.abs(s.turn) * Math.PI) / 180;
    // the gap is narrowest at the pivot end and opens toward the other end
    const pivot = s.turn >= 0 ? -frame.halfAlong : frame.halfAlong;
    const second: Placement = {
      side: -1,
      rim: profile.rimSecond,
      saltSeed: 500,
      gap: Math.max(0, s.gap) * s.unit,
      turn: s.turn >= 0 ? turn : -turn,
      pivot,
    };
    pieces.push(second, first);
  } else if (s.keep === 'bottom') {
    pieces.push({ ...first, side: -1 });
  } else {
    pieces.push(first);
  }

  for (const placement of pieces) {
    const piece = new Float32Array(width * height * 4);
    renderPiece(source, width, height, frame, profile, placement, s, piece);
    drawPiece(out, piece, s.shadow > 0 ? shadowAlpha(piece, width, height, frame, profile, s) : null);
  }

  const result = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < result.length; i += 4) {
    result[i] = out[i];
    result[i + 1] = out[i + 1];
    result[i + 2] = out[i + 2];
    result[i + 3] = out[i + 3] * 255;
  }
  return result;
}
